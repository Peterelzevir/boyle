/**
 * Complete WhatsApp Bot Implementation
 * Includes all features: sticker, tiktok, instagram, pinterest, clone, AI, background removal
 */

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    makeInMemoryStore,
    proto,
    getContentType,
    downloadContentFromMessage,
    generateWAMessageFromContent
} = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const pino = require('pino')
const path = require('path')
const fs = require('fs')
const readline = require('readline')
const axios = require('axios')
const FileType = require('file-type')
const Jimp = require('jimp')
const qrcode = require('qrcode-terminal')
const { removeBackgroundFromImageUrl } = require('remove.bg')

// Constants and ASCII Art
const SESSION_DIR = './sessions'
const TEMP_DIR = './temp'
const BOT_NAME = 'Pinemark'
const RECONNECT_INTERVAL = 3000
const WATERMARK = '\n\n_Powered by @hiyaok on Telegram_'

const ASCII_ART = `
╔═════════════════════════════════════╗
║     ╔═╗╦╔╗╔╔═╗╔╦╗╔═╗╦═╗╦╔═         ║
║     ╠═╝║║║║║╣ ║║║╠═╣╠╦╝╠╩╗         ║
║     ╩  ╩╝╚╝╚═╝╩ ╩╩ ╩╩╚═╩ ╩         ║
║                                     ║
║        WhatsApp Bot Pine            ║
╚═════════════════════════════════════╝`

const CLONE_ASCII = `
╔════════════════════════════════════╗
║     ╔═╗╦  ╔═╗╔╗╔╔═╗  ╔╗ ╔═╗╔╦╗    ║
║     ║  ║  ║ ║║║║║╣   ╠╩╗║ ║ ║     ║
║     ╚═╝╩═╝╚═╝╝╚╝╚═╝  ╚═╝╚═╝ ╩     ║
║                                    ║
║      Clone Session Manager         ║
╚════════════════════════════════════╝`

// Help menu
const helpMenu = `${ASCII_ART}

*Welcome to ${BOT_NAME} Bot!* 🤖

*Sticker Commands:*
➤ .sticker - Convert image to sticker
➤ .foto - Convert sticker to image

*Downloader Commands:*
➤ .tiktok <url> - Download TikTok video
➤ .ig <url> - Download Instagram content

*Search Commands:*
➤ .pinterest <query> - Search Pinterest images

*Other Commands:*
➤ .clone <number> - Clone bot to another number
➤ .menu - Show this help menu

*Additional Features:*
• Auto AI response for text messages
• Auto background removal for images

Made with ❤️ by Pinemark Team ${WATERMARK}`

// Logger setup
const logger = pino({
    level: 'debug',
    transport: {
        target: 'pino-pretty',
        options: {
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
        }
    }
})

// Store setup
const store = makeInMemoryStore({ logger })
store.readFromFile('./baileys_store.json')
setInterval(() => {
    store.writeToFile('./baileys_store.json')
}, 10000)

// Create required directories
for (const dir of [SESSION_DIR, TEMP_DIR]) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
        logger.info(`Created directory: ${dir}`)
    }
}

// Utility Functions
const downloadMedia = async (message, type) => {
    try {
        const stream = await downloadContentFromMessage(message[type], type.split('M')[0])
        let buffer = Buffer.from([])
        for await(const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }
        return buffer
    } catch (error) {
        logger.error('Error downloading media:', error)
        throw error
    }
}

const serialize = (msg) => {
    if (!msg.message) return msg
    const type = getContentType(msg.message)
    return {
        ...msg,
        type,
        id: msg.key.id,
        from: msg.key.remoteJid,
        fromMe: msg.key.fromMe,
        pushName: msg.pushName,
        participant: msg.key.participant,
        message: msg.message
    }
}

// Core Connection Function
const connectToWhatsApp = async (number, loginMethod = 'qr', sessionName = 'main-session') => {
    try {
        const { version, isLatest } = await fetchLatestBaileysVersion()
        logger.info(`Using WA v${version.join('.')}, isLatest: ${isLatest}`)

        const sessionDir = path.join(SESSION_DIR, sessionName)
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir)

        const sock = makeWASocket({
            version,
            logger,
            printQRInTerminal: loginMethod === 'qr',
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            generateHighQualityLinkPreview: true,
            browser: [BOT_NAME, 'Chrome', '4.0.0'],
            getMessage: async key => {
                const msg = await store.loadMessage(key.remoteJid, key.id)
                return msg?.message || undefined
            },
            markOnlineOnConnect: true,
            defaultQueryTimeoutMs: 60000
        })

        store.bind(sock.ev)

        // Connection handler
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update
            
            if(qr) {
                logger.info('QR Code received, please scan using WhatsApp app')
            }

            if(connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut
                
                logger.info('Connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect)

                if(shouldReconnect) {
                    setTimeout(() => connectToWhatsApp(number, loginMethod, sessionName), RECONNECT_INTERVAL)
                } else {
                    logger.info('Connection closed. You are logged out.')
                    process.exit(1)
                }
            } else if(connection === 'open') {
                if (loginMethod === 'pairing') {
                    try {
                        const code = await sock.requestPairingCode(number)
                        logger.info('='.repeat(50))
                        logger.info('PAIRING CODE:', code)
                        logger.info('='.repeat(50))
                    } catch (err) {
                        logger.error('Failed to get pairing code:', err)
                    }
                }
                logger.info('Connected to WhatsApp')
            }
        })

        sock.ev.on('creds.update', saveCreds)

        // Message handler
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return

            const msg = messages[0]
            if (!msg?.message) return

            const serialized = serialize(msg)
            if (serialized.fromMe) return

            try {
                await handleIncomingMessage(sock, serialized)
            } catch (error) {
                logger.error('Error handling message:', error)
            }
        })

        return sock

    } catch (err) {
        logger.error('Error in connection:', err)
        throw err
    }
}

// Message Handlers
const handleIncomingMessage = async (sock, msg) => {
    const type = msg.type
    const from = msg.from
    const body = type === 'conversation' ? msg.message.conversation :
                type === 'imageMessage' ? msg.message.imageMessage.caption :
                type === 'videoMessage' ? msg.message.videoMessage.caption : ''

    if (!body) return

    // Handle commands
    if (body.startsWith('.')) {
        const [command, ...args] = body.slice(1).toLowerCase().trim().split(' ')
        
        try {
            switch(command) {
                case 'menu':
                case 'help':
                    await sock.sendMessage(from, { text: helpMenu })
                    break

                case 'sticker':
                    if (type === 'imageMessage') {
                        await handleStickerCreation(sock, msg)
                    } else {
                        await sock.sendMessage(from, { 
                            text: '*⚠️ Please send an image with caption .sticker*' + WATERMARK 
                        })
                    }
                    break

                case 'tiktok':
                    await handleTikTokDownload(sock, msg, args)
                    break

                case 'ig':
                    await handleInstagramDownload(sock, msg, args)
                    break

                case 'pinterest':
                    await handlePinterestSearch(sock, msg, args)
                    break

                case 'clone':
                    await handleCloneBot(sock, msg, args)
                    break

                default:
                    await sock.sendMessage(from, { 
                        text: '*⚠️ Unknown command*' + WATERMARK 
                    })
            }
        } catch (error) {
            logger.error('Command error:', error)
            await sock.sendMessage(from, { 
                text: '*❌ Error executing command*' + WATERMARK 
            })
        }
    }
    // Handle normal messages
    else {
        if (type === 'imageMessage') {
            await handleBackgroundRemoval(sock, msg)
        } else {
            await handleAIResponse(sock, msg, body)
        }
    }
}

// Feature Handlers
const handleStickerCreation = async (sock, msg) => {
    const processingMsg = await sock.sendMessage(msg.from, {
        text: '_Creating sticker..._' + WATERMARK
    })

    try {
        const buffer = await downloadMedia(msg.message, 'imageMessage')
        const tempFile = path.join(TEMP_DIR, `${msg.id}.png`)
        fs.writeFileSync(tempFile, buffer)

        const image = await Jimp.read(tempFile)
        await image.resize(512, Jimp.AUTO)
        await image.writeAsync(tempFile)

        await sock.sendImageAsSticker(msg.from, tempFile, {
            pack: BOT_NAME,
            author: 'boyle goblok',
            categories: ['🤖'],
            quality: 50
        })

        fs.unlinkSync(tempFile)
        await sock.sendMessage(msg.from, { delete: processingMsg.key })
    } catch (error) {
        logger.error('Sticker creation error:', error)
        await sock.sendMessage(msg.from, {
            edit: processingMsg.key,
            text: '*❌ Failed to create sticker*' + WATERMARK
        })
    }
}

const handleTikTokDownload = async (sock, msg, args) => {
    if (!args[0]) {
        await sock.sendMessage(msg.from, {
            text: '*⚠️ Please provide a TikTok URL*' + WATERMARK
        })
        return
    }

    const processingMsg = await sock.sendMessage(msg.from, {
        text: '_Processing TikTok download..._' + WATERMARK
    })

    try {
        const response = await axios.get(`https://api.ryzendesu.vip/api/downloader/aiodown?url=${args[0]}`)
        const videoData = response.data.data.data
        
        const caption = `*${BOT_NAME} TikTok Downloader*\n\n` +
            `*Title:* ${videoData.title}\n` +
            `*Author:* ${videoData.author.nickname}\n` +
            `*Duration:* ${videoData.duration}s\n` +
            `*Views:* ${videoData.play_count}\n` +
            `*Likes:* ${videoData.digg_count}` +
            WATERMARK

        await sock.sendMessage(msg.from, {
            video: { url: videoData.hdplay },
            caption: caption,
            mimetype: 'video/mp4'
        })

        await sock.sendMessage(msg.from, { delete: processingMsg.key })
    } catch (error) {
        logger.error('TikTok download error:', error)
        await sock.sendMessage(msg.from, {
            edit: processingMsg.key,
            text: '*❌ Failed to download TikTok video*' + WATERMARK
        })
    }
}

const handleInstagramDownload = async (sock, msg, args) => {
    if (!args[0]) {
        await sock.sendMessage(msg.from, {
            text: '*⚠️ Please provide an Instagram URL*' + WATERMARK
        })
        return
    }

    const processingMsg = await sock.sendMessage(msg.from, {
        text: '_Processing Instagram download..._' + WATERMARK
    })

    try {
        const response = await axios.get(`https://api.ryzendesu.vip/api/downloader/igdl?url=${args[0]}`)
        const mediaUrl = response.data.data[0].url

        await sock.sendMessage(msg.from, {
            video: { url: mediaUrl },
            caption: `*${BOT_NAME} Instagram Downloader*` + WATERMARK,
            mimetype: 'video/mp4'
        })

        await sock.sendMessage(msg.from, { delete: processingMsg.key })
    } catch (error) {
        logger.error('Instagram download error:', error)
        await sock.sendMessage(msg.from, {
            edit: processingMsg.key,
            text: '*❌ Failed to download Instagram media*' + WATERMARK
        })
    }
}

const handlePinterestSearch = async (sock, msg, args) => {
    if (!args[0]) {
        await sock.sendMessage(msg.from, {
            text: '*⚠️ Please provide a search query*' + WATERMARK
        })
        return
    }

    const processingMsg = await sock.sendMessage(msg.from, {
        text: '_Searching Pinterest..._' + WATERMARK
    })

    try {
        const query = args.join(' ')
        const response = await axios.get(`https://api.ryzendesu.vip/api/search/pinterest?query=${query}`)

        for (const imageUrl of response.data) {
            await sock.sendMessage(msg.from, {
                image: { url: imageUrl },
                caption: `*${BOT_NAME} Pinterest Search*` + WATERMARK
            })
        }

        await sock.sendMessage(msg.from, { delete: processingMsg.key })
    } catch (error) {
        logger.error('Pinterest search error:', error)
        await sock.sendMessage(msg.from, {
            edit: processingMsg.key,
            text: '*❌ Failed to search Pinterest*' + WATERMARK
        })
    }
}

const handleCloneBot = async (sock, msg, args) => {
    if (!args[0]) {
        await sock.sendMessage(msg.from, {
            text: '*⚠️ Please provide a target number\nFormat: .clone 6281234567890*' + WATERMARK
        })
        return
    }

    const processingMsg = await sock.sendMessage(msg.from, {
        text: `${CLONE_ASCII}\n\n*🤖 Initializing ${BOT_NAME} clone process...*` + WATERMARK
    })

    try {
        const cloneNumber = args[0]
        const cloneSession = `clone-${cloneNumber}`
        
        const cloneSock = await connectToWhatsApp(cloneNumber, 'qr', cloneSession)

        cloneSock.ev.on('messages.upsert', async ({ messages }) => {
            await handleIncomingMessage(cloneSock, messages[0])
        })

        await sock.sendMessage(msg.from, {
            edit: processingMsg.key,
            text: `${CLONE_ASCII}\n\n*✅ Clone created successfully*\n\n*Number:* ${cloneNumber}\n*Status:* Online\n\n_Scan the QR code above to connect_` + WATERMARK
        })

    } catch (error) {
        logger.error('Clone error:', error)
        await sock.sendMessage(msg.from, {
            edit: processingMsg.key,
            text: `${CLONE_ASCII}\n\n*❌ Failed to create clone*` + WATERMARK
        })
    }
}

const handleBackgroundRemoval = async (sock, msg) => {
    const processingMsg = await sock.sendMessage(msg.from, {
        text: '_Removing background..._' + WATERMARK
    })

    try {
        const buffer = await downloadMedia(msg.message, 'imageMessage')
        const tempFile = path.join(TEMP_DIR, `${msg.id}.png`)
        fs.writeFileSync(tempFile, buffer)

        const response = await axios.get(`https://api.ryzendesu.vip/api/ai/removebg?url=${encodeURIComponent(tempFile)}`, {
            responseType: 'arraybuffer'
        })

        await sock.sendMessage(msg.from, {
            image: response.data,
            caption: `*${BOT_NAME} Background Removal*` + WATERMARK
        })

        fs.unlinkSync(tempFile)
        await sock.sendMessage(msg.from, { delete: processingMsg.key })
    } catch (error) {
        logger.error('Background removal error:', error)
        await sock.sendMessage(msg.from, {
            edit: processingMsg.key,
            text: '*❌ Failed to remove background*' + WATERMARK
        })
    }
}

const handleAIResponse = async (sock, msg, text) => {
    const processingMsg = await sock.sendMessage(msg.from, {
        text: '_Thinking..._' + WATERMARK
    })

    try {
        const response = await axios.get(`https://api.ryzendesu.vip/api/ai/claude?text=${encodeURIComponent(text)}`)
        await sock.sendMessage(msg.from, {
            edit: processingMsg.key,
            text: `*🤖 ${response.data.response}*` + WATERMARK
        })
    } catch (error) {
        logger.error('AI response error:', error)
        await sock.sendMessage(msg.from, {
            edit: processingMsg.key,
            text: '*❌ Failed to get AI response*' + WATERMARK
        })
    }
}

// Start Bot Function
const startBot = async () => {
    console.log(ASCII_ART)
    logger.info('Starting WhatsApp Bot')

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    rl.question('Enter phone number (with country code): ', number => {
        rl.question('Choose login method (1: QR Code, 2: Pairing Code): ', async choice => {
            const loginMethod = choice === '2' ? 'pairing' : 'qr'
            
            try {
                await connectToWhatsApp(number, loginMethod)
            } catch (err) {
                logger.error('Failed to start bot:', err)
                process.exit(1)
            }
        })
    })
}

// Error handlers
process.on('uncaughtException', err => {
    logger.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', err => {
    logger.error('Unhandled Rejection:', err)
})

// Start the bot
startBot()
