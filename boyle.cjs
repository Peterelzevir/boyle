// by hiyaok on telegram

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    makeInMemoryStore,
    getContentType,
    downloadContentFromMessage,
    isJidGroup
} = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const pino = require('pino')
const path = require('path')
const fs = require('fs')
const readline = require('readline')
const axios = require('axios')
const FileType = require('file-type')
const { writeFile } = require('fs/promises')
const ffmpeg = require('fluent-ffmpeg')
const sharp = require('sharp')

// Constants
const SESSION_DIR = './sessions'
const TEMP_DIR = './temp'
const BOT_NAME = 'Pinemark'
const WATERMARK = '\n\n_Powered by @hiyaok on Telegram_'
const OWNER_NUMBER = '628972538700' // Replace with your number

// Help Menu Template
const helpMenu = `*Command List ${BOT_NAME}*

*Sticker Commands:*
➤ .s / .sticker - Create sticker from image/video
➤ .toimg - Convert sticker to image

*Downloader Commands:*
➤ .tiktok [url] - Download TikTok video
➤ .ig [url] - Download Instagram post
➤ .yt [url] - Download YouTube video

*Group Commands:*
➤ .add [number] - Add member
➤ .kick [@user] - Remove member
➤ .promote [@user] - Promote to admin
➤ .demote [@user] - Demote admin

*Other Commands:*
➤ .menu - Show this help menu
➤ .ping - Check bot status
➤ .owner - Contact bot owner

${WATERMARK}`

// Logger Configuration
const logger = pino({
    level: 'silent',
    transport: {
        target: 'pino-pretty'
    }
})

// Store Configuration
const store = makeInMemoryStore({ logger })
store.readFromFile('./baileys_store.json')
setInterval(() => {
    store.writeToFile('./baileys_store.json')
}, 10000)

// Create Required Directories
for (const dir of [SESSION_DIR, TEMP_DIR]) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
}

// Utility Functions
const downloadMedia = async (message, messageType) => {
    try {
        const stream = await downloadContentFromMessage(message[messageType], messageType.split('M')[0])
        let buffer = Buffer.from([])
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }
        return buffer
    } catch (error) {
        console.error('Error downloading media:', error)
        throw error
    }
}

const serialize = (msg) => {
    if (!msg.message) return msg
    const type = getContentType(msg.message) || ''
    return {
        ...msg,
        type,
        id: msg.key.id,
        from: msg.key.remoteJid,
        fromMe: msg.key.fromMe,
        pushName: msg.pushName || 'User',
        isGroup: isJidGroup(msg.key.remoteJid),
        body: type === 'conversation' ? msg.message.conversation :
              type === 'imageMessage' ? msg.message.imageMessage.caption :
              type === 'videoMessage' ? msg.message.videoMessage.caption : ''
    }
}

// Message Handler Functions
const handleStickerCommand = async (sock, msg) => {
    const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage
    if (!quoted) {
        await sock.sendMessage(msg.from, { text: '❌ Reply to an image/video with .sticker command' })
        return
    }

    const messageType = Object.keys(quoted)[0]
    if (!['imageMessage', 'videoMessage'].includes(messageType)) {
        await sock.sendMessage(msg.from, { text: '❌ Reply to an image/video only!' })
        return
    }

    try {
        const media = await downloadMedia(quoted, messageType)
        const tempFile = path.join(TEMP_DIR, `temp_${Date.now()}.${messageType === 'videoMessage' ? 'mp4' : 'jpg'}`)
        await writeFile(tempFile, media)

        // Process media to sticker
        if (messageType === 'imageMessage') {
            await sharp(tempFile)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .toFormat('webp')
                .toFile(tempFile + '.webp')
        } else {
            // For video, convert to WebP
            await new Promise((resolve, reject) => {
                ffmpeg(tempFile)
                    .toFormat('webp')
                    .addOutputOptions([
                        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba',
                        '-vcodec', 'libwebp',
                        '-lossless', '1',
                        '-preset', 'default',
                        '-loop', '0',
                        '-an',
                        '-vsync', '0',
                        '-t', '10'
                    ])
                    .save(tempFile + '.webp')
                    .on('end', resolve)
                    .on('error', reject)
            })
        }

        // Send sticker
        await sock.sendMessage(msg.from, {
            sticker: { url: tempFile + '.webp' }
        })

        // Cleanup
        fs.unlinkSync(tempFile)
        fs.unlinkSync(tempFile + '.webp')

    } catch (error) {
        console.error('Error creating sticker:', error)
        await sock.sendMessage(msg.from, { text: '❌ Failed to create sticker' })
    }
}

const handleTikTokDownload = async (sock, msg, url) => {
    if (!url) {
        await sock.sendMessage(msg.from, { text: '❌ Please provide TikTok URL!' })
        return
    }

    try {
        const response = await axios.get(`https://api.tiklydown.link/api/download?url=${url}`)
        const videoData = response.data

        await sock.sendMessage(msg.from, {
            video: { url: videoData.video.noWatermark },
            caption: `✅ Downloaded from TikTok\n\n*Author:* ${videoData.author.nickname}\n*Description:* ${videoData.title}\n\n${WATERMARK}`
        })
    } catch (error) {
        console.error('TikTok download error:', error)
        await sock.sendMessage(msg.from, { text: '❌ Failed to download TikTok video' })
    }
}

const handleInstagramDownload = async (sock, msg, url) => {
    if (!url) {
        await sock.sendMessage(msg.from, { text: '❌ Please provide Instagram URL!' })
        return
    }

    try {
        const response = await axios.get(`https://insta-dl.herokuapp.com/download?url=${url}`)
        const mediaUrl = response.data.media_url

        await sock.sendMessage(msg.from, {
            video: { url: mediaUrl },
            caption: `✅ Downloaded from Instagram\n\n${WATERMARK}`
        })
    } catch (error) {
        console.error('Instagram download error:', error)
        await sock.sendMessage(msg.from, { text: '❌ Failed to download Instagram content' })
    }
}

// Group Command Handlers
const handleGroupCommand = async (sock, msg, command, args) => {
    if (!msg.isGroup) {
        await sock.sendMessage(msg.from, { text: '❌ This command can only be used in groups!' })
        return
    }

    try {
        const groupMetadata = await sock.groupMetadata(msg.from)
        const isAdmin = groupMetadata.participants.find(p => p.id === msg.sender)?.admin

        if (!isAdmin) {
            await sock.sendMessage(msg.from, { text: '❌ You need to be an admin to use this command!' })
            return
        }

        switch (command) {
            case 'add':
                if (!args[0]) {
                    await sock.sendMessage(msg.from, { text: '❌ Provide a number to add!' })
                    return
                }
                const number = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net'
                await sock.groupParticipantsUpdate(msg.from, [number], 'add')
                break

            case 'kick':
                if (!msg.message.extendedTextMessage?.contextInfo?.participant) {
                    await sock.sendMessage(msg.from, { text: '❌ Tag someone to kick!' })
                    return
                }
                const user = msg.message.extendedTextMessage.contextInfo.participant
                await sock.groupParticipantsUpdate(msg.from, [user], 'remove')
                break

            case 'promote':
            case 'demote':
                if (!msg.message.extendedTextMessage?.contextInfo?.participant) {
                    await sock.sendMessage(msg.from, { text: `❌ Tag someone to ${command}!` })
                    return
                }
                const participant = msg.message.extendedTextMessage.contextInfo.participant
                await sock.groupParticipantsUpdate(msg.from, [participant], command === 'promote' ? 'promote' : 'demote')
                break
        }
    } catch (error) {
        console.error('Group command error:', error)
        await sock.sendMessage(msg.from, { text: '❌ Failed to execute group command' })
    }
}

// Main Message Handler
const handleIncomingMessage = async (sock, msg) => {
    if (!msg.body.startsWith('.')) return

    const [command, ...args] = msg.body.slice(1).toLowerCase().split(' ')
    const fullArgs = args.join(' ')

    try {
        switch (command) {
            case 'menu':
            case 'help':
                await sock.sendMessage(msg.from, { text: helpMenu })
                break

            case 's':
            case 'sticker':
                await handleStickerCommand(sock, msg)
                break

            case 'tiktok':
                await handleTikTokDownload(sock, msg, args[0])
                break

            case 'ig':
                await handleInstagramDownload(sock, msg, args[0])
                break

            case 'add':
            case 'kick':
            case 'promote':
            case 'demote':
                await handleGroupCommand(sock, msg, command, args)
                break

            case 'ping':
                const start = Date.now()
                await sock.sendMessage(msg.from, { text: 'Testing ping...' })
                const end = Date.now()
                await sock.sendMessage(msg.from, { text: `🏓 Pong!\n💫 Speed: ${end - start}ms` })
                break

            case 'owner':
                const ownerContact = {
                    displayName: 'Pinemark Owner',
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:pinemark\nTEL;type=CELL;type=VOICE;waid=${OWNER_NUMBER}:+${OWNER_NUMBER}\nEND:VCARD`
                }
                await sock.sendMessage(msg.from, { contacts: { contacts: [ownerContact] } })
                break

            default:
                await sock.sendMessage(msg.from, { text: '❌ Unknown command! Use .menu to see available commands.' })
        }
    } catch (error) {
        console.error('Error handling command:', error)
        await sock.sendMessage(msg.from, { text: '❌ An error occurred while processing your command' })
    }
}

// Connection Function
const connectToWhatsApp = async () => {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
    const sock = makeWASocket({
        logger,
        printQRInTerminal: true,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        defaultQueryTimeoutMs: undefined,
        browser: [BOT_NAME, 'Chrome', '4.0.0']
    })

    store.bind(sock.ev)

    // Connection Update Handler
    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom) ? 
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true
            console.log('Connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect)
            if (shouldReconnect) {
                connectToWhatsApp()
            }
        } else if (connection === 'open') {
            console.log('Connected successfully!')
        }
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return

        for (const msg of messages) {
            try {
                const serialized = serialize(msg)
                await handleIncomingMessage(sock, serialized)
            } catch (error) {
                console.error('Error processing message:', error)
            }
        }
    })

    return sock
}

// Start Bot Function
const startBot = async () => {
    console.log('Starting WhatsApp Bot...')
    await connectToWhatsApp()
}

// Error Handlers
process.on('uncaughtException', console.error)
process.on('unhandledRejection', console.error)

// Start the bot
startBot()
