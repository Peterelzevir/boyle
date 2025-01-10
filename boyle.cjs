/**
 * WhatsApp Bot Implementation
 * Using @whiskeysockets/baileys
 */

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
    downloadMediaMessage,
    getContentType
} = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const pino = require('pino')
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const axios = require('axios')
const sharp = require('sharp')
const ffmpeg = require('fluent-ffmpeg')
const { exec } = require('child_process')
const { removeBackgroundFromImageUrl } = require('remove.bg')
const FileType = require('file-type')

// Constants
const SESSION_DIR = './sessions'
const TEMP_DIR = './temp'
const BOT_NAME = 'PinemarkBot'
const OWNER_NUMBER = '628972538700' // Ganti dengan nomor owner

// ASCII Art
const ASCII_ART = `
╔═════════════════════════════════════╗
║     ╔═╗╦╔╗╔╔═╗╔╦╗╔═╗╦═╗╦╔═         ║
║     ╠═╝║║║║║╣ ║║║╠═╣╠╦╝╠╩╗         ║
║     ╩  ╩╝╚╝╚═╝╩ ╩╩ ╩╩╚═╩ ╩         ║
║                                     ║
║        WhatsApp Bot Pine            ║
╚═════════════════════════════════════╝`

// Help Menu
const HELP_MENU = `
*${BOT_NAME} Command List*

*1.* Sticker Commands:
  *.sticker* - Create sticker from image/video
  *.toimg* - Convert sticker to image

*2.* Downloader:
  *.tiktok [url]* - Download TikTok video
  *.ig [url]* - Download Instagram post

*3.* Group Commands:
  *.add [number]* - Add member
  *.kick [@mention]* - Remove member
  *.promote [@mention]* - Promote to admin
  *.demote [@mention]* - Demote from admin

*4.* Bot Commands:
  *.menu* - Show this menu
  *.ping* - Check bot response
  *.owner* - Get owner contact
  *.clone [number]* - Clone bot (Owner only)

✨ Made by Pinemark Team`

// Logger Configuration
const logger = pino({
    level: 'silent',
    transport: {
        target: 'pino-pretty',
        options: {
            translateTime: 'SYS:dd-mm-yyyy HH:MM:ss',
            ignore: 'pid,hostname'
        }
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
const getBuffer = async (url) => {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' })
        return Buffer.from(response.data, 'binary')
    } catch (error) {
        console.error('Error fetching buffer:', error)
        throw error
    }
}

// Feature Handlers
async function handleStickerCommand(sock, msg) {
    const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage
    const from = msg.key.remoteJid
    
    if (!quoted) {
        await sock.sendMessage(from, { text: '❌ Reply to media with .sticker command!' })
        return
    }

    const type = Object.keys(quoted)[0]
    if (!['imageMessage', 'videoMessage'].includes(type)) {
        await sock.sendMessage(from, { text: '❌ Reply to image/video only!' })
        return
    }

    const processing = await sock.sendMessage(from, { text: '_Creating sticker..._' })

    try {
        const media = await downloadMediaMessage(msg, 'buffer')
        const tempFile = path.join(TEMP_DIR, `temp_${Date.now()}.${type === 'videoMessage' ? 'mp4' : 'jpg'}`)
        fs.writeFileSync(tempFile, media)

        const outputFile = tempFile + '.webp'

        if (type === 'imageMessage') {
            await sharp(tempFile)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .toFormat('webp')
                .toFile(outputFile)
        } else {
            await new Promise((resolve, reject) => {
                ffmpeg(tempFile)
                    .inputFormat('mp4')
                    .on('error', reject)
                    .on('end', () => resolve(true))
                    .addOutputOptions([
                        '-vcodec', 'libwebp',
                        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba',
                        '-loop', '0',
                        '-preset', 'default',
                        '-an',
                        '-vsync', '0',
                        '-ss', '00:00:00'
                    ])
                    .toFormat('webp')
                    .save(outputFile)
            })
        }

        await sock.sendMessage(from, {
            sticker: { url: outputFile },
            mimetype: 'image/webp'
        })

        // Cleanup
        fs.unlinkSync(tempFile)
        fs.unlinkSync(outputFile)
        await sock.sendMessage(from, { delete: processing.key })

    } catch (error) {
        console.error('Sticker creation error:', error)
        await sock.sendMessage(from, { text: '❌ Failed to create sticker!' })
    }
}

async function handleTikTokDownload(sock, msg, url) {
    const from = msg.key.remoteJid
    
    if (!url) {
        await sock.sendMessage(from, { text: '❌ Provide TikTok URL!' })
        return
    }

    const processing = await sock.sendMessage(from, { text: '_Downloading TikTok..._' })

    try {
        const response = await axios.get(`https://api.tiklydown.link/api/download?url=${url}`)
        const data = response.data
        
        await sock.sendMessage(from, {
            video: { url: data.video.noWatermark },
            caption: `✅ *TikTok Downloaded*\n\n*Author:* ${data.author.nickname}\n*Description:* ${data.title}`,
            mimetype: 'video/mp4'
        })

        await sock.sendMessage(from, { delete: processing.key })
    } catch (error) {
        console.error('TikTok download error:', error)
        await sock.sendMessage(from, { text: '❌ Failed to download TikTok!' })
    }
}

async function handleInstagramDownload(sock, msg, url) {
    const from = msg.key.remoteJid
    
    if (!url) {
        await sock.sendMessage(from, { text: '❌ Provide Instagram URL!' })
        return
    }

    const processing = await sock.sendMessage(from, { text: '_Downloading Instagram..._' })

    try {
        const response = await axios.get(`https://insta-dl.herokuapp.com/download?url=${url}`)
        const mediaUrl = response.data.media_url
        
        await sock.sendMessage(from, {
            video: { url: mediaUrl },
            caption: '✅ *Instagram Downloaded*',
            mimetype: 'video/mp4'
        })

        await sock.sendMessage(from, { delete: processing.key })
    } catch (error) {
        console.error('Instagram download error:', error)
        await sock.sendMessage(from, { text: '❌ Failed to download Instagram!' })
    }
}

async function handleGroupCommand(sock, msg, command, args) {
    const from = msg.key.remoteJid
    
    if (!msg.isGroup) {
        await sock.sendMessage(from, { text: '❌ Group command only!' })
        return
    }

    try {
        const groupMetadata = await sock.groupMetadata(from)
        const isAdmin = groupMetadata.participants.find(p => p.id === msg.sender)?.admin
        const botNumber = sock.user.id
        const isBotAdmin = groupMetadata.participants.find(p => p.id === botNumber)?.admin

        if (!isAdmin || !isBotAdmin) {
            await sock.sendMessage(from, { text: '❌ Need admin access!' })
            return
        }

        switch (command) {
            case 'add':
                if (!args[0]) return
                const number = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net'
                await sock.groupParticipantsUpdate(from, [number], 'add')
                break

            case 'kick':
                const user = msg.message.extendedTextMessage?.contextInfo?.participant
                if (!user) return
                await sock.groupParticipantsUpdate(from, [user], 'remove')
                break

            case 'promote':
            case 'demote':
                const participant = msg.message.extendedTextMessage?.contextInfo?.participant
                if (!participant) return
                await sock.groupParticipantsUpdate(from, [participant], command === 'promote' ? 'promote' : 'demote')
                break
        }

    } catch (error) {
        console.error('Group command error:', error)
        await sock.sendMessage(from, { text: '❌ Command failed!' })
    }
}

// Main Message Handler
async function handleIncomingMessage(sock, msg) {
    if (!msg.message) return

    const type = getContentType(msg.message)
    const from = msg.key.remoteJid
    const isGroup = from.endsWith('@g.us')
    const sender = isGroup ? msg.key.participant : msg.key.remoteJid
    const isOwner = sender === OWNER_NUMBER + '@s.whatsapp.net'
    const body = type === 'conversation' ? msg.message.conversation :
                 type === 'extendedTextMessage' ? msg.message.extendedTextMessage.text :
                 type === 'imageMessage' ? msg.message.imageMessage.caption :
                 type === 'videoMessage' ? msg.message.videoMessage.caption : ''

    // Log message for debugging
    console.log(`[MSG] From: ${sender}, Type: ${type}, Body: ${body}`)

    if (body.startsWith('.')) {
        const [command, ...args] = body.slice(1).toLowerCase().trim().split(/ +/)
        
        try {
            switch (command) {
                case 'menu':
                case 'help':
                    await sock.sendMessage(from, { text: HELP_MENU })
                    break

                case 'sticker':
                case 's':
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
                    await sock.sendMessage(from, { text: 'Testing ping...' })
                    await sock.sendMessage(from, { text: `🏓 Pong!\n💫 Response: ${Date.now() - start}ms` })
                    break

                case 'owner':
                    const vcard = 'BEGIN:VCARD\n' +
                                'VERSION:3.0\n' +
                                `FN:${BOT_NAME} Owner\n` +
                                `TEL;type=CELL;type=VOICE;waid=${OWNER_NUMBER}:+${OWNER_NUMBER}\n` +
                                'END:VCARD'
                    
                    await sock.sendMessage(from, { 
                        contacts: { 
                            displayName: 'Owner', 
                            contacts: [{ vcard }] 
                        }
                    })
                    break

                default:
                    await sock.sendMessage(from, { text: '❌ Unknown command! Use .menu' })
            }
        } catch (error) {
            console.error('Command error:', error)
            await sock.sendMessage(from, { text: '❌ Command failed!' })
        }
    }
}

// Connection Function
async function connectToWhatsApp(sessionName = 'main-session', isClone = false) {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(SESSION_DIR, sessionName))
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: true,
        auth: state,
        getMessage: async (key) => {
            return await store.loadMessage(key.remoteJid, key.id) || undefined
        },
        generateHighQualityLinkPreview: true,
        browser: [BOT_NAME, 'Chrome', '4.0.0'],
    })

    // Bind store setelah socket dibuat
    store.bind(sock.ev)

    // Connection Update Handler
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom) &&
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut

            console.log('Connection closed due to', lastDisconnect?.error?.output?.statusCode)

            if (shouldReconnect) {
                console.log('Reconnecting...')
                await connectToWhatsApp(sessionName, isClone)
            }
        } else if (connection === 'open') {
            console.log(isClone ? 'Clone bot connected!' : 'Bot connected!')
        }
    })

    // Handle credentials update
    sock.ev.on('creds.update', saveCreds)

    // Message handler
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type === 'notify') {
            for (const msg of messages) {
                try {
                    await handleIncomingMessage(sock, msg)
                } catch (error) {
                    console.error('Error handling message:', error)
                }
            }
        }
    })

    return sock
}

// Pairing Code Function
async function getPairingCode(sock, number) {
    if (!number.startsWith('+')) {
        number = '+' + number
    }
    
    try {
        const code = await sock.requestPairingCode(number)
        console.log('='.repeat(50))
        console.log('YOUR PAIRING CODE:', code)
        console.log('='.repeat(50))
        return code
    } catch (error) {
        console.error('Failed to get pairing code:', error)
        throw error
    }
}

// Start Bot Function
async function startBot() {
    console.clear()
    console.log(ASCII_ART)
    console.log('\nStarting WhatsApp Bot...\n')

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    const question = (text) => new Promise((resolve) => rl.question(text, resolve))

    try {
        const choice = await question('Choose login method:\n1. QR Code\n2. Pairing Code\nEnter choice (1/2): ')
        
        if (choice === '2') {
            const phoneNumber = await question('\nEnter phone number (e.g., 6281234567890): ')
            console.log('\nInitializing connection...')
            const sock = await connectToWhatsApp('main-session')
            await getPairingCode(sock, phoneNumber)
        } else {
            console.log('\nGenerating QR Code...')
            await connectToWhatsApp('main-session')
        }

        rl.close()
    } catch (error) {
        console.error('Failed to start bot:', error)
        process.exit(1)
    }
}
