// WhatsApp Bot with Enhanced Features
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    makeInMemoryStore,
    getContentType,
    downloadContentFromMessage,
    isJidGroup,
    generateWAMessageFromContent,
    proto
} = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const pino = require('pino')
const path = require('path')
const fs = require('fs')
const qrcode = require('qrcode')
const readline = require('readline')
const axios = require('axios')
const FileType = require('file-type')
const { writeFile } = require('fs/promises')
const ffmpeg = require('fluent-ffmpeg')
const sharp = require('sharp')
const moment = require('moment-timezone')
const os = require('os')

// Constants
const SESSION_DIR = './sessions'
const TEMP_DIR = './temp'
const BOT_NAME = 'Pinemark'
const STICKER_AUTHOR = 'boyle kocak anak tonggi'
const WATERMARK = '\n\n_Powered by @hiyaok on Telegram_'
const OWNER_NUMBER = '6281280174445'

// Enhanced Help Menu Template
const helpMenu = `╭━━━━━━━━━━━━━━━━━━━━━╮
┃       *${BOT_NAME}*  
┃
┃ *BOT INFO*
┃ Prefix : .
┃ Name : ${BOT_NAME}
┃ Platform : ${os.platform()}
┃ Runtime : _run_
┃ Language : _JavaScript_
┃
┃ *FEATURES*
┃
┃ *🎯 STICKER*
┃ ├ _.s / .sticker_
┃ └ _.toimg_
┃
┃ *📥 DOWNLOADER*
┃ ├ _.tiktok [url]_
┃ ├ _.ig [url]_
┃ └ _.yt [url]_
┃
┃ *👥 GROUP*
┃ ├ _.add [number]_
┃ ├ _.kick [@user]_
┃ ├ _.promote [@user]_ 
┃ └ _.demote [@user]_
┃
┃ *🛠️ OTHER*
┃ ├ _.menu_
┃ ├ _.ping_
┃ ├ _.owner_
┃ └ _.clone_
┃
╰━━━━━━━━━━━━━━━━━━━━━╯
${WATERMARK}`

// Success Connection Message Template
const successMessage = `╭━━━━『 *BOT CONNECTED* 』━━━━╮
┃
┃ *BOT INFO*
┃ Name : ${BOT_NAME}
┃ Version : 1.0.0
┃ Language : JavaScript
┃ Platform : ${os.platform()}
┃ RAM : ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB
┃ Hostname : ${os.hostname()}
┃
┃ *SYSTEM INFO*
┃ CPU : ${os.cpus()[0].model}
┃ Total RAM : ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB
┃ Free RAM : ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB
┃ OS Type : ${os.type()}
┃ Platform : ${os.platform()}
┃
┃ *TIME INFO*
┃ Time : ${moment().tz('Asia/Jakarta').format('HH:mm:ss')}
┃ Date : ${moment().tz('Asia/Jakarta').format('DD/MM/YYYY')}
┃
╰━━━━━━━━━━━━━━━━━━━━━╯`

// Logger Configuration
const logger = pino({
    level: 'silent',
    transport: {
        target: 'pino-pretty'
    }
})

// Store Configuration
const store = makeInMemoryStore({ logger })
store?.readFromFile('./baileys_store.json')
setInterval(() => {
    store?.writeToFile('./baileys_store.json')
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

// Reply Message Function
const replyMessage = async (sock, msg, text) => {
    await sock.sendMessage(msg.from, { 
        text: text,
        contextInfo: {
            stanzaId: msg.id,
            participant: msg.sender,
            quotedMessage: msg.message
        }
    }, { quoted: msg })
}

// Convert Sticker to Image Function
const convertStickerToImage = async (stickerData) => {
    const tempFile = path.join(TEMP_DIR, `temp_${Date.now()}.webp`)
    const outputFile = tempFile + '.png'
    
    await writeFile(tempFile, stickerData)

    try {
        await sharp(tempFile)
            .toFormat('png')
            .toFile(outputFile)

        const imageBuffer = fs.readFileSync(outputFile)
        fs.unlinkSync(tempFile)
        fs.unlinkSync(outputFile)
        return imageBuffer
    } catch (error) {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
        if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile)
        throw error
    }
}

// Clone Bot Function with Enhanced Status
const cloneBot = async (sock, msg) => {
    const cloneSessionDir = path.join(SESSION_DIR, `clone_${Date.now()}`)
    fs.mkdirSync(cloneSessionDir, { recursive: true })

    await replyMessage(sock, msg, '🤖 *CLONE BOT INITIALIZATION*\n\nPreparing clone instance...')

    const { state, saveCreds } = await useMultiFileAuthState(cloneSessionDir)
    const cloneSock = makeWASocket({
        logger,
        printQRInTerminal: true,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        browser: [BOT_NAME + ' Clone', 'Safari', '5.6.8']
    })

    // Generate and send QR code
    cloneSock.ev.on('connection.update', async ({ qr, connection }) => {
        if (qr) {
            const qrBuffer = await qrcode.toBuffer(qr)
            await sock.sendMessage(msg.from, {
                image: qrBuffer,
                caption: `🤖 *CLONE BOT QR CODE*\n\n` +
                        `Scan this QR code to clone the bot\n` +
                        `QR will expire in 60 seconds\n\n` +
                        `Note: Make sure to use a fresh WhatsApp number`,
                contextInfo: {
                    stanzaId: msg.id,
                    participant: msg.sender,
                    quotedMessage: msg.message
                }
            }, { quoted: msg })
        }
        
        if (connection === 'open') {
            const successMsg = `╭━━━『 *CLONE BOT CONNECTED* 』━━━╮
┃
┃ *STATUS: ONLINE* ✅
┃ Time: ${moment().tz('Asia/Jakarta').format('HH:mm:ss')}
┃ Date: ${moment().tz('Asia/Jakarta').format('DD/MM/YYYY')}
┃
┃ *CLONE INFO*
┃ Name: ${BOT_NAME} Clone
┃ Version: 1.0.0
┃ Platform: ${os.platform()}
┃ Memory Usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB
┃
┃ Your clone bot is ready to use! 🚀
┃ All features are identical to main bot
┃
╰━━━━━━━━━━━━━━━━━━━━━╯`

            await sock.sendMessage(msg.from, { 
                text: successMsg,
                contextInfo: {
                    stanzaId: msg.id,
                    participant: msg.sender,
                    quotedMessage: msg.message
                }
            }, { quoted: msg })
        }
    })

    cloneSock.ev.on('creds.update', saveCreds)
    
    // Implement same message handling for clone
    cloneSock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return
        for (const msg of messages) {
            try {
                await handleIncomingMessage(cloneSock, msg)
            } catch (error) {
                console.error('Error processing message in clone:', error)
            }
        }
    })
}

// Enhanced Sticker Creation Function with Updated Author
const createSticker = async (mediaData, type) => {
    const tempFile = path.join(TEMP_DIR, `temp_${Date.now()}.${type === 'video' ? 'mp4' : 'jpg'}`)
    const outputFile = tempFile + '.webp'
    
    await writeFile(tempFile, mediaData)
    try {
        if (type === 'image') {
            await sharp(tempFile)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .webp({
                    quality: 95,
                    lossless: true
                })
                .toFile(outputFile)
            
            // Updated metadata with new author
            const exif = {
                'sticker-pack-id': `${BOT_NAME}_${Date.now()}`,
                'sticker-pack-name': BOT_NAME,
                'sticker-pack-publisher': 'boyle anak tonggi',
            }
            const exifBuffer = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
            const jsonBuffer = Buffer.from(JSON.stringify(exif))
            const result = Buffer.concat([exifBuffer, jsonBuffer])
            
            await fs.promises.writeFile(outputFile, result)
        } else {
            await new Promise((resolve, reject) => {
                ffmpeg(tempFile)
                    .outputOptions([
                        "-vcodec", "libwebp",
                        "-vf", "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse",
                        "-loop", "0",
                        "-ss", "00:00:00",
                        "-t", "00:00:10",
                        "-preset", "default",
                        "-an",
                        "-vsync", "0",
                        "-metadata", 'author="boyle anak tonggi"'
                    ])
                    .toFormat('webp')
                    .save(outputFile)
                    .on('end', resolve)
                    .on('error', reject)
            })
        }
        
        const stickerBuffer = await fs.promises.readFile(outputFile)
        await Promise.all([
            fs.promises.unlink(tempFile),
            fs.promises.unlink(outputFile)
        ])
        return stickerBuffer
    } catch (error) {
        await Promise.all([
            fs.existsSync(tempFile) && fs.promises.unlink(tempFile),
            fs.existsSync(outputFile) && fs.promises.unlink(outputFile)
        ])
        throw error
    }
}

// Utility function for making curl requests
const makeCurlRequest = async (url, options = {}) => {
    const { exec } = require('child_process');
    const curlCommand = `curl -s "${url}"`;
    
    return new Promise((resolve, reject) => {
        exec(curlCommand, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            try {
                resolve(JSON.parse(stdout));
            } catch (e) {
                resolve(stdout);
            }
        });
    });
};

// Enhanced API handlers with better error handling
const handleInstagramDownload = async (sock, msg, args) => {
    if (!Array.isArray(args)) args = [args];
    
    if (!args[0]) {
        await sock.sendMessage(msg.from, {
            text: '*_⚠️ Please provide an Instagram URL_*' + WATERMARK
        });
        return;
    }

    const processingMsg = await sock.sendMessage(msg.from, {
        text: '_Processing Instagram download..._' + WATERMARK
    });

    try {
        const response = await makeCurlRequest(`https://api.ryzendesu.vip/api/downloader/igdl?url=${encodeURIComponent(args[0])}`);
        
        if (!response?.data?.[0]?.url) {
            throw new Error('No media URL found in response');
        }

        const mediaUrl = response.data[0].url;
        const isVideo = mediaUrl.toLowerCase().includes('.mp4');

        await sock.sendMessage(msg.from, {
            [isVideo ? 'video' : 'image']: { url: mediaUrl },
            caption: `*${BOT_NAME} Instagram Downloader*` + WATERMARK,
            ...(isVideo && { mimetype: 'video/mp4' })
        });

        await sock.sendMessage(msg.from, { delete: processingMsg.key });
    } catch (error) {
        console.error('Instagram download error:', error);
        await sock.sendMessage(msg.from, {
            edit: processingMsg.key,
            text: '*❌ Failed to download Instagram media. Please try again later.*' + WATERMARK
        });
    }
};

const handleTikTokDownload = async (sock, msg, args) => {
    if (!Array.isArray(args)) args = [args];
    
    if (!args[0]) {
        await sock.sendMessage(msg.from, {
            text: '*⚠️ Please provide a TikTok URL*' + WATERMARK
        });
        return;
    }

    const processingMsg = await sock.sendMessage(msg.from, {
        text: '_Processing TikTok download..._' + WATERMARK
    });

    try {
        const response = await makeCurlRequest(`https://api.ryzendesu.vip/api/downloader/ttdl?url=${encodeURIComponent(args[0])}`);
        
        if (!response?.data?.data?.hdplay) {
            throw new Error('No video URL found in response');
        }

        const videoData = response.data.data;
        const caption = `*${BOT_NAME} TikTok Downloader*\n\n` +
            `*Title:* ${videoData.title || 'N/A'}\n` +
            `*Author:* ${videoData.author?.nickname || 'N/A'}\n` +
            `*Duration:* ${videoData.duration || 'N/A'}s\n` +
            `*Views:* ${videoData.play_count || 'N/A'}\n` +
            `*Likes:* ${videoData.digg_count || 'N/A'}` +
            WATERMARK;

        await sock.sendMessage(msg.from, {
            video: { url: videoData.hdplay },
            caption: caption,
            mimetype: 'video/mp4'
        });

        await sock.sendMessage(msg.from, { delete: processingMsg.key });
    } catch (error) {
        console.error('TikTok download error:', error);
        await sock.sendMessage(msg.from, {
            edit: processingMsg.key,
            text: '*❌ Failed to download TikTok media. Please try again later.*' + WATERMARK
        });
    }
};

const handlePinterestSearch = async (sock, msg, args) => {
    if (!Array.isArray(args) || !args[0]) {
        await sock.sendMessage(msg.from, {
            text: '*⚠️ Please provide a search query*' + WATERMARK
        });
        return;
    }

    const processingMsg = await sock.sendMessage(msg.from, {
        text: '_Searching Pinterest..._' + WATERMARK
    });

    try {
        const query = args.join(' ');
        const response = await makeCurlRequest(`https://api.ryzendesu.vip/api/search/pinterest?query=${encodeURIComponent(query)}`);

        if (!Array.isArray(response) || response.length === 0) {
            throw new Error('No results found');
        }

        const maxImages = Math.min(5, response.length); // Limit to 5 images
        for (let i = 0; i < maxImages; i++) {
            await sock.sendMessage(msg.from, {
                image: { url: response[i] },
                caption: `*${BOT_NAME} Pinterest Search*` + WATERMARK
            });
        }

        await sock.sendMessage(msg.from, { delete: processingMsg.key });
    } catch (error) {
        console.error('Pinterest search error:', error);
        await sock.sendMessage(msg.from, {
            edit: processingMsg.key,
            text: '*❌ Failed to search Pinterest. Please try again later.*' + WATERMARK
        });
    }
};

// Handle Group Commands
const handleGroupCommand = async (sock, msg, command, args) => {
    if (!msg.isGroup) {
        await replyMessage(sock, msg, '❌ This command can only be used in groups!')
        return
    }

    try {
        const groupMetadata = await sock.groupMetadata(msg.from)
        const isAdmin = groupMetadata.participants.find(p => p.id === msg.sender)?.admin

        if (!isAdmin) {
            await replyMessage(sock, msg, '❌ You need to be an admin to use this command!')
            return
        }

        switch (command) {
            case 'add':
                if (!args[0]) {
                    await replyMessage(sock, msg, '❌ Provide a number to add!')
                    return
                }
                const number = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net'
                await sock.groupParticipantsUpdate(msg.from, [number], 'add')
                await replyMessage(sock, msg, '✅ Member added successfully!')
                break

            case 'kick':
                if (!msg.message.extendedTextMessage?.contextInfo?.participant) {
                    await replyMessage(sock, msg, '❌ Tag someone to kick!')
                    return
                }
                const user = msg.message.extendedTextMessage.contextInfo.participant
                await sock.groupParticipantsUpdate(msg.from, [user], 'remove')
                await replyMessage(sock, msg, '✅ Member kicked successfully!')
                break

            case 'promote':
            case 'demote':
                if (!msg.message.extendedTextMessage?.contextInfo?.participant) {
                    await replyMessage(sock, msg, `❌ Tag someone to ${command}!`)
                    return
                }
                const participant = msg.message.extendedTextMessage.contextInfo.participant
                await sock.groupParticipantsUpdate(msg.from, [participant], command === 'promote' ? 'promote' : 'demote')
                await replyMessage(sock, msg, `✅ Member ${command}d successfully!`)
                break
        }
    } catch (error) {
        console.error('Group command error:', error)
        await replyMessage(sock, msg, '❌ Failed to execute group command')
    }
}

// Main Message Handler
const handleIncomingMessage = async (sock, msg) => {
    const serialized = {
        ...msg,
        id: msg.key.id,
        from: msg.key.remoteJid,
        fromMe: msg.key.fromMe,
        sender: msg.key.participant || msg.key.remoteJid,
        message: msg.message,
        pushName: msg.pushName,
        isGroup: isJidGroup(msg.key.remoteJid)
    }

    const body = msg.message?.conversation || 
                msg.message?.imageMessage?.caption ||
                msg.message?.videoMessage?.caption || 
                msg.message?.extendedTextMessage?.text || ''

    if (!body.startsWith('.')) return

    const [command, ...args] = body.slice(1).toLowerCase().split(' ')
    const fullArgs = args.join(' ')

    try {
        switch (command) {
            case 'menu':
            case 'help':
                await replyMessage(sock, serialized, helpMenu)
                break

            case 's':
            case 'sticker':
                await handleStickerCommand(sock, serialized)
                break

            case 'toimg':
                await handleToImageCommand(sock, serialized)
                break

            case 'tiktok':
            case 'tt':
            case 't':
                await handleTikTokDownload(sock, serialized, args[0])
                break

            case 'ig':
            case 'insta':
            case 'g':
                await handleInstagramDownload(sock, serialized, args[0])
                break
                
            case 'pin':
            case 'pinterest':
                await handlePinterestSearch(sock, serialized, args[0])
                break

            case 'add':
            case 'kick':
            case 'promote':
            case 'demote':
                await handleGroupCommand(sock, serialized, command, args)
                break

            case 'ping':
            case 'cek':
                const start = Date.now()
                await replyMessage(sock, serialized, '🏓 Testing ping...')
                const end = Date.now()
                await replyMessage(sock, serialized, `🏓 *Pong!*\n💫 Speed: ${end - start}ms`)
                break

            case 'owner':
            case 'own':
                const vcard = 'BEGIN:VCARD\n' +
                            'VERSION:3.0\n' +
                            `FN:${BOT_NAME} Owner\n` +
                            `TEL;type=CELL;type=VOICE;waid=${OWNER_NUMBER}:+${OWNER_NUMBER}\n` +
                            'END:VCARD'

                await sock.sendMessage(serialized.from, { 
                    contacts: { 
                        displayName: 'Owner', 
                        contacts: [{ vcard }] 
                    },
                    contextInfo: {
                        stanzaId: serialized.id,
                        participant: serialized.sender,
                        quotedMessage: serialized.message
                    }
                }, { quoted: serialized })
                break

            case 'clone':
            case 'c':
                if (serialized.sender === OWNER_NUMBER + '@s.whatsapp.net') {
                    await cloneBot(sock, serialized)
                } else {
                    await replyMessage(sock, serialized, '❌ Only owner can use this command!')
                }
                break

            default:
                await replyMessage(sock, serialized, '❌ Unknown command! Use .menu to see available commands.')
        }
    } catch (error) {
        console.error('Error handling command:', error)
        await replyMessage(sock, serialized, '❌ An error occurred while processing your command')
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
        browser: [BOT_NAME, 'Safari', '5.6.8']
    })

    store?.bind(sock.ev)

    // Connection Update Handler
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom) ? 
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true
            
            console.log('Connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect)
            
            if (shouldReconnect) {
                connectToWhatsApp()
            }
        } else if (connection === 'open') {
            console.log('Bot connected successfully!')
            await sock.sendMessage(OWNER_NUMBER + '@s.whatsapp.net', { 
                text: successMessage
            })
        }
    })

    sock.ev.on('creds.update', saveCreds)
    
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return
        for (const msg of messages) {
            try {
                await handleIncomingMessage(sock, msg)
            } catch (error) {
                console.error('Error processing message:', error)
            }
        }
    })

    return sock
}

// Error Handlers
process.on('uncaughtException', console.error)
process.on('unhandledRejection', console.error)

// Start the bot
console.log('Starting WhatsApp Bot...')
connectToWhatsApp()
