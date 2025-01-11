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
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const qrcode = require('qrcode')
const readline = require('readline')
const webp = require('node-webpmux');
const axios = require('axios')
const FileType = require('file-type')
const { writeFile } = require('fs/promises')
const ffmpeg = require('fluent-ffmpeg')
const sharp = require('sharp')
const moment = require('moment-timezone')
const os = require('os')

// Helper function to execute curl command
const executeCurl = async (url) => {
    const curlCommand = `curl -X GET '${url}' -H 'accept: application/json'`;
    const { stdout } = await execAsync(curlCommand);
    return JSON.parse(stdout);
};

// Constants
const SESSION_DIR = './sessions'
const TEMP_DIR = './temp'
const BOT_NAME = 'Pinemark'
const STICKER_AUTHOR = 'boyle kocak anak tonggi'
const WATERMARK = '\n\n_Powered by @hiyaok on Telegram_'
const OWNER_NUMBER = '6281280174445'

// Enhanced sticker constants 
const STICKER_METADATA = {
    pack: BOT_NAME,
    author: STICKER_AUTHOR, 
    categories: ['🤖'],
    android: "https://play.google.com/store/apps/details?id=com.whatsapp",
    ios: "https://apps.apple.com/app/whatsapp-messenger/id310633997",
    packname: `${BOT_NAME} Pack`
};

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
const downloadMedia = async (message, type) => {
    try {
        if (!message[type]) throw new Error('Media not found');
        
        const stream = await downloadContentFromMessage(message[type], type.split('Message')[0]);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        return buffer;
    } catch (error) {
        console.error('Download media error:', error);
        throw new Error('Failed to download media');
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

// Enhanced Sticker Creation Function
const createSticker = async (mediaData, type) => {
    const tempFile = path.join(TEMP_DIR, `temp_${Date.now()}.${type === 'video' ? 'mp4' : 'jpg'}`);
    const outputFile = tempFile + '.webp';
    
    try {
        await fs.promises.writeFile(tempFile, mediaData);
        
        if (type === 'image') {
            // Process image first
            await sharp(tempFile)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .webp({ quality: 100 })
                .toFile(outputFile);

            // Add proper metadata
            const img = new webp.Image();
            await img.load(outputFile);
            
            const json = {
                "sticker-pack-id": `${BOT_NAME}.${Date.now()}`,
                "sticker-pack-name": STICKER_METADATA.pack,
                "sticker-pack-publisher": STICKER_METADATA.author,
                "android-app-store-link": STICKER_METADATA.android,
                "ios-app-store-link": STICKER_METADATA.ios,
                "emojis": STICKER_METADATA.categories
            };

            img.exif = Buffer.from(JSON.stringify(json));
            await img.save(outputFile);

        } else if (type === 'video') {
            await new Promise((resolve, reject) => {
                ffmpeg(tempFile)
                    .inputOptions(["-t", "10"])
                    .outputOptions([
                        "-vcodec", "libwebp",
                        "-vf", "scale=512:512:force_original_aspect_ratio=decrease,fps=15",
                        "-lossless", "1",
                        "-loop", "0",
                        "-preset", "default",
                        "-an",
                        "-vsync", "0"
                    ])
                    .toFormat("webp")
                    .save(outputFile)
                    .on("end", resolve)
                    .on("error", reject);
            });
            
            // Add metadata to video sticker
            const img = new webp.Image();
            await img.load(outputFile);
            
            const json = {
                "sticker-pack-id": `${BOT_NAME}.${Date.now()}`,
                "sticker-pack-name": STICKER_METADATA.pack,
                "sticker-pack-publisher": STICKER_METADATA.author,
                "android-app-store-link": STICKER_METADATA.android,
                "ios-app-store-link": STICKER_METADATA.ios,
                "emojis": STICKER_METADATA.categories
            };

            img.exif = Buffer.from(JSON.stringify(json));
            await img.save(outputFile);
        }

        const finalBuffer = await fs.promises.readFile(outputFile);
        
        // Cleanup
        await Promise.all([
            fs.promises.unlink(tempFile).catch(() => {}),
            fs.promises.unlink(outputFile).catch(() => {})
        ]);
        
        return finalBuffer;
    } catch (error) {
        console.error('Sticker creation error:', error);
        throw error;
    }
};

// ToImage Handler
const handleToImageCommand = async (sock, msg) => {
    const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted?.stickerMessage) {
        await sock.sendMessage(msg.from, {
            text: '❌ Reply to a sticker with .toimg command'
        }, { quoted: msg });
        return;
    }

    const processingMsg = await sock.sendMessage(msg.from, {
        text: '_⏳ Converting sticker to image..._'
    }, { quoted: msg });

    try {
        const stickerData = await downloadMedia(quoted, 'stickerMessage');
        const outputPath = path.join(TEMP_DIR, `${Date.now()}.png`);
        
        await sharp(stickerData)
            .png()
            .toFile(outputPath);

        const imageBuffer = await fs.promises.readFile(outputPath);
        await fs.promises.unlink(outputPath);

        await sock.sendMessage(msg.from, {
            image: imageBuffer,
            caption: '✅ Sticker converted to image'
        }, { quoted: msg });

        await sock.sendMessage(msg.from, { delete: processingMsg.key });
    } catch (error) {
        console.error('ToImage conversion error:', error);
        await sock.sendMessage(msg.from, {
            edit: processingMsg.key,
            text: '❌ Failed to convert sticker to image'
        });
    }
};

// Sticker Handler
const handleStickerCommand = async (sock, serialized) => {
    const senderId = serialized.sender;
    console.log('1. Sticker handler started for sender:', senderId);

    if (!waitingResponse.has(senderId)) {
        console.log('2. Setting waiting response for sticker');
        waitingResponse.set(senderId, { type: 'sticker' });
        await sock.sendMessage(serialized.from, {
            text: '*🎨 STICKER MAKER*\n\nSilakan kirim atau reply sebuah gambar!' + WATERMARK
        }, { quoted: serialized });
        return;
    }

    // Check if message contains image
    const isImage = serialized.message?.imageMessage;
    const isQuotedImage = serialized.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
    
    if (!isImage && !isQuotedImage) {
        console.log('3. No image found in message');
        waitingResponse.delete(senderId);
        await sock.sendMessage(serialized.from, { 
            text: '❌ Mohon kirim gambar atau reply sebuah gambar!' + WATERMARK 
        }, { quoted: serialized });
        return;
    }

    // Clear waiting response
    waitingResponse.delete(senderId);
    console.log('4. Processing image to sticker');

    const processingMsg = await sock.sendMessage(serialized.from, {
        text: '_Sedang membuat sticker..._' + WATERMARK
    });

    try {
        // Download the image
        const message = isImage ? serialized : {
            message: {
                imageMessage: serialized.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage
            }
        };

        const media = await downloadMediaMessage(
            message,
            'buffer',
            {},
            { logger: console }
        );

        // Create sticker
        const sticker = new Sticker(media, {
            pack: 'boyle anak tonggi',
            author: 'boyle anak tonggi',
            type: StickerTypes.FULL,
            quality: 50
        });

        const stickerBuffer = await sticker.toBuffer();
        await writeFile('./temp-sticker.webp', stickerBuffer);

        await sock.sendMessage(serialized.from, { 
            sticker: stickerBuffer 
        }, { 
            quoted: serialized 
        });

    } catch (error) {
        console.error('Sticker error:', error);
        await sock.sendMessage(serialized.from, { 
            text: '❌ Maaf, terjadi kesalahan saat membuat sticker!' + WATERMARK
        }, { 
            quoted: serialized 
        });
    } finally {
        await sock.sendMessage(serialized.from, { 
            delete: processingMsg.key 
        }).catch(() => {});
    }
};

// Instagram Handler
const handleInstagramDownload = async (sock, serialized) => {
    const senderId = serialized.sender;
    console.log('1. Instagram handler started for sender:', senderId);

    if (!waitingResponse.has(senderId)) {
        console.log('2. Setting waiting response for Instagram');
        waitingResponse.set(senderId, { type: 'instagram' });
        await sock.sendMessage(serialized.from, {
            text: '*📥 INSTAGRAM DOWNLOADER*\n\nPlease send the Instagram video URL (Reels/Post)' + WATERMARK
        }, { quoted: serialized });
        return;
    }

    const url = serialized.message?.conversation || 
                serialized.message?.extendedTextMessage?.text || '';
    console.log('3. URL received:', url);

    if (!url.includes('instagram.com')) {
        console.log('4. Invalid Instagram URL');
        waitingResponse.delete(senderId);
        await sock.sendMessage(serialized.from, {
            text: '*❌ Invalid Instagram URL!*\nPlease send a valid Instagram video URL.' + WATERMARK
        }, { quoted: serialized });
        return;
    }

    waitingResponse.delete(senderId);
    console.log('5. Processing Instagram URL');

    const processingMsg = await sock.sendMessage(serialized.from, {
        text: '_Processing Instagram video..._' + WATERMARK
    });

    try {
        await sock.sendMessage(serialized.from, {
            text: '_Getting video information..._' + WATERMARK,
            edit: processingMsg.key
        });

        const apiUrl = `https://api.ryzendesu.vip/api/downloader/igdl?url=${encodeURIComponent(url)}`;
        const response = await executeCurl(apiUrl);

        if (!response.success || !response.data?.[0]?.url) {
            throw new Error('Video not found');
        }

        const mediaUrl = response.data[0].url;
        if (!mediaUrl.includes('.mp4')) {
            throw new Error('Not a video');
        }

        await sock.sendMessage(serialized.from, {
            text: '_Downloading video..._' + WATERMARK,
            edit: processingMsg.key
        });

        // Download video using curl
        const { stdout: videoBuffer } = await execAsync(
            `curl -X GET '${mediaUrl}' --output -`
        );

        await sock.sendMessage(serialized.from, {
            text: '_Sending video..._' + WATERMARK,
            edit: processingMsg.key
        });

        await sock.sendMessage(serialized.from, {
            video: Buffer.from(videoBuffer),
            caption: `*${BOT_NAME} Instagram Downloader*` + WATERMARK,
            mimetype: 'video/mp4'
        }, { quoted: serialized });

    } catch (error) {
        console.error('Instagram error:', error);
        let errorMessage = '*❌ Failed to download Instagram video.*\n';
        
        if (error.message.includes('Not a video')) {
            errorMessage = '*❌ Only video posts are supported.*';
        } else if (error.message.includes('Video not found')) {
            errorMessage = '*❌ Video not found or is private.*';
        } else {
            errorMessage += 'Please check your URL and try again.';
        }

        await sock.sendMessage(serialized.from, {
            text: errorMessage + WATERMARK
        });
    } finally {
        await sock.sendMessage(serialized.from, { 
            delete: processingMsg.key 
        }).catch(() => {});
    }
};

// TikTok Handler
const handleTikTokDownload = async (sock, serialized) => {
    const senderId = serialized.sender;
    console.log('1. TikTok handler started for sender:', senderId);

    if (!waitingResponse.has(senderId)) {
        console.log('2. Setting waiting response for TikTok');
        waitingResponse.set(senderId, { type: 'tiktok' });
        await sock.sendMessage(serialized.from, {
            text: '*📥 TIKTOK DOWNLOADER*\n\nPlease send the TikTok video URL' + WATERMARK
        }, { quoted: serialized });
        return;
    }

    const url = serialized.message?.conversation || 
                serialized.message?.extendedTextMessage?.text || '';
    console.log('3. URL received:', url);

    if (!url.includes('tiktok.com')) {
        console.log('4. Invalid TikTok URL');
        waitingResponse.delete(senderId);
        await sock.sendMessage(serialized.from, {
            text: '*❌ Invalid TikTok URL!*\nPlease send a valid TikTok video URL.' + WATERMARK
        }, { quoted: serialized });
        return;
    }

    waitingResponse.delete(senderId);
    console.log('5. Processing TikTok URL');

    const processingMsg = await sock.sendMessage(serialized.from, {
        text: '_Processing TikTok video..._' + WATERMARK
    });

    try {
        await sock.sendMessage(serialized.from, {
            text: '_Getting video information..._' + WATERMARK,
            edit: processingMsg.key
        });

        const apiUrl = `https://api.ryzendesu.vip/api/downloader/ttdl?url=${encodeURIComponent(url)}`;
        const response = await executeCurl(apiUrl);

        if (!response.success || !response.data?.data?.data?.hdplay) {
            throw new Error('Video not found');
        }

        await sock.sendMessage(serialized.from, {
            text: '_Downloading video..._' + WATERMARK,
            edit: processingMsg.key
        });

        const videoData = response.data.data.data;
        const { stdout: videoBuffer } = await execAsync(
            `curl -X GET '${videoData.hdplay}' --output -`
        );

        await sock.sendMessage(serialized.from, {
            text: '_Sending video..._' + WATERMARK,
            edit: processingMsg.key
        });

        const caption = `*${BOT_NAME} TikTok Downloader*\n\n` +
            `*Title:* ${videoData.title || 'N/A'}\n` +
            `*Author:* ${videoData.author?.nickname || 'N/A'}` +
            WATERMARK;

        await sock.sendMessage(serialized.from, {
            video: Buffer.from(videoBuffer),
            caption: caption,
            mimetype: 'video/mp4'
        }, { quoted: serialized });

    } catch (error) {
        console.error('TikTok error:', error);
        let errorMessage = '*❌ Failed to download TikTok video.*\n';
        errorMessage += error.message.includes('Video not found') ? 
            'Video not available or private.' : 
            'Please check your URL and try again.';
        
        await sock.sendMessage(serialized.from, {
            text: errorMessage + WATERMARK
        });
    } finally {
        await sock.sendMessage(serialized.from, { 
            delete: processingMsg.key 
        }).catch(() => {});
    }
};

// Spotify Handler
const handleSpotifyDownload = async (sock, serialized) => {
    const senderId = serialized.sender;
    console.log('1. Spotify handler started for sender:', senderId);

    if (!waitingResponse.has(senderId)) {
        console.log('2. Setting waiting response for Spotify');
        waitingResponse.set(senderId, { type: 'spotify' });
        await sock.sendMessage(serialized.from, {
            text: '*📥 SPOTIFY DOWNLOADER*\n\nPlease send the Spotify track URL' + WATERMARK
        }, { quoted: serialized });
        return;
    }

    const url = serialized.message?.conversation || 
                serialized.message?.extendedTextMessage?.text || '';
    console.log('3. URL received:', url);

    if (!url.includes('spotify.com')) {
        console.log('4. Invalid Spotify URL');
        waitingResponse.delete(senderId);
        await sock.sendMessage(serialized.from, {
            text: '*❌ Invalid Spotify URL!*\nPlease send a valid Spotify track URL.' + WATERMARK
        }, { quoted: serialized });
        return;
    }

    waitingResponse.delete(senderId);
    console.log('5. Processing Spotify URL');

    const processingMsg = await sock.sendMessage(serialized.from, {
        text: '_Processing Spotify track..._' + WATERMARK
    });

    try {
        await sock.sendMessage(serialized.from, {
            text: '_Getting track information..._' + WATERMARK,
            edit: processingMsg.key
        });

        const apiUrl = `https://api.ryzendesu.vip/api/downloader/spotify?url=${encodeURIComponent(url)}`;
        const response = await executeCurl(apiUrl);

        if (!response.success || !response.link) {
            throw new Error('Track not found');
        }

        await sock.sendMessage(serialized.from, {
            text: '_Downloading track..._' + WATERMARK,
            edit: processingMsg.key
        });

        const { stdout: audioBuffer } = await execAsync(
            `curl -X GET '${response.link}' --output -`
        );

        await sock.sendMessage(serialized.from, {
            text: '_Sending track..._' + WATERMARK,
            edit: processingMsg.key
        });

        const caption = `*${BOT_NAME} Spotify Downloader*\n\n` +
            `*Title:* ${response.metadata?.title || 'N/A'}\n` +
            `*Artist:* ${response.metadata?.artists || 'N/A'}\n` +
            `*Album:* ${response.metadata?.album || 'N/A'}\n` +
            `*Release:* ${response.metadata?.releaseDate || 'N/A'}` +
            WATERMARK;

        await sock.sendMessage(serialized.from, {
            audio: Buffer.from(audioBuffer),
            mimetype: 'audio/mp3',
            fileName: `${response.metadata?.title || 'spotify-track'}.mp3`,
            caption: caption
        }, { quoted: serialized });

    } catch (error) {
        console.error('Spotify error:', error);
        let errorMessage = '*❌ Failed to download Spotify track.*\n';
        errorMessage += error.message.includes('Track not found') ? 
            'Track not found or is not available.' : 
            'Please check your URL and try again.';

        await sock.sendMessage(serialized.from, {
            text: errorMessage + WATERMARK
        });
    } finally {
        await sock.sendMessage(serialized.from, { 
            delete: processingMsg.key 
        }).catch(() => {});
    }
};

// SS Web Handler
const handleSSWeb = async (sock, msg) => {
    const senderId = msg.sender || msg.from;

    // If no waiting response, ask for URL
    if (!waitingResponse.has(senderId)) {
        waitingResponse.set(senderId, {
            type: 'ssweb',
            step: 'url'
        });
        
        await sock.sendMessage(msg.from, {
            text: `*🌐 SCREENSHOT WEB*\n\nSilahkan kirim URL website yang ingin discreenshot` + WATERMARK
        }, { quoted: msg });
        return;
    }

    const waiting = waitingResponse.get(senderId);
    
    // Get URL from user's message
    if (waiting.step === 'url') {
        const url = msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text || '';

        // Validate URL
        try {
            new URL(url);
        } catch {
            waitingResponse.delete(senderId);
            await sock.sendMessage(msg.from, {
                text: '*❌ URL tidak valid! Silahkan coba lagi dengan URL yang benar.*\nContoh: https://google.com' + WATERMARK
            });
            return;
        }

        // Ask for mode
        waitingResponse.set(senderId, {
            type: 'ssweb',
            step: 'mode',
            url: url
        });

        await sock.sendMessage(msg.from, {
            text: `*🌐 PILIH MODE SCREENSHOT*\n\nKetik angka sesuai pilihan:\n\n1. Desktop Mode\n2. Phone Mode\n3. Full Page` + WATERMARK
        });
        return;
    }

    // Get mode from user's choice
    if (waiting.step === 'mode') {
        const choice = msg.message?.conversation || 
                      msg.message?.extendedTextMessage?.text || '';

        let mode;
        switch (choice) {
            case '1':
                mode = 'desktop';
                break;
            case '2':
                mode = 'phone';
                break;
            case '3':
                mode = 'full';
                break;
            default:
                waitingResponse.delete(senderId);
                await sock.sendMessage(msg.from, {
                    text: '*❌ Pilihan tidak valid! Silahkan coba lagi.*' + WATERMARK
                });
                return;
        }

        // Clear waiting response
        waitingResponse.delete(senderId);

        const processingMsg = await sock.sendMessage(msg.from, {
            text: '_Mengambil screenshot..._' + WATERMARK
        });

        try {
            const apiUrl = `https://api.ryzendesu.vip/api/tool/ssweb?url=${encodeURIComponent(waiting.url)}&mode=${mode}`;
            
            const response = await axios.get(apiUrl, {
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const buffer = Buffer.from(response.data);

            const modeNames = {
                'desktop': 'Desktop Mode',
                'phone': 'Phone Mode',
                'full': 'Full Page'
            };

            await sock.sendMessage(msg.from, {
                image: buffer,
                caption: `*🌐 Screenshot Web*\n\n*URL:* ${waiting.url}\n*Mode:* ${modeNames[mode]}` + WATERMARK
            }, { quoted: msg });

            await sock.sendMessage(msg.from, { 
                delete: processingMsg.key 
            }).catch(() => {});

        } catch (error) {
            console.error('Screenshot error:', error);
            await sock.sendMessage(msg.from, {
                text: '*❌ Gagal mengambil screenshot. Website mungkin tidak dapat diakses.*' + WATERMARK
            });
            await sock.sendMessage(msg.from, { 
                delete: processingMsg.key 
            }).catch(() => {});
        }
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

// Track waiting responses
const waitingResponse = new Map();

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

    // Check if waiting for a response
    if (waitingResponse.has(serialized.sender)) {
        const waiting = waitingResponse.get(serialized.sender);
        
        switch (waiting.type) {
            case 'instagram':
                await handleInstagramDownload(sock, serialized);
                break;
            case 'tiktok':
                await handleTikTokDownload(sock, serialized);
                break;
            case 'spotify':
                await handleSpotifyDownload(sock, serialized);
                break;
            case 'ssweb':
                await handleSSWeb(sock, serialized);
                break;
        }
        return;
    }

    const body = msg.message?.conversation || 
                msg.message?.imageMessage?.caption ||
                msg.message?.videoMessage?.caption || 
                msg.message?.extendedTextMessage?.text || '';

    if (!body.startsWith('.')) return;

    const [command, ...args] = body.slice(1).toLowerCase().split(' ');
    const fullArgs = args.join(' ');

    try {
        switch (command) {
            case 'menu':
            case 'help':
                await replyMessage(sock, serialized, helpMenu);
                break;

            case 's':
            case 'sticker':
                await handleStickerCommand(sock, serialized);
                break;

            case 'toimg':
                await handleToImageCommand(sock, serialized);
                break;

            case 'tiktok':
            case 'tt':
            case 't':
                await handleTikTokDownload(sock, serialized);
                break;
                
            case 'spotify':
            case 'spo':
                await handleSpotifyDownload(sock, serialized);
                break;
                
            case 'ss':
            case 'ssweb':
                await handleSSWeb(sock, serialized);
                break;

            case 'ig':
            case 'insta':
            case 'g':
                await handleInstagramDownload(sock, serialized);
                break;
                
            case 'add':
            case 'kick':
            case 'promote':
            case 'demote':
                await handleGroupCommand(sock, serialized, command, args);
                break;

            case 'ping':
            case 'cek':
                const start = Date.now();
                await replyMessage(sock, serialized, '🏓 Testing ping...');
                const end = Date.now();
                await replyMessage(sock, serialized, `🏓 *Pong!*\n💫 Speed: ${end - start}ms`);
                break;

            case 'owner':
            case 'own':
                const vcard = 'BEGIN:VCARD\n' +
                            'VERSION:3.0\n' +
                            `FN:${BOT_NAME} Owner\n` +
                            `TEL;type=CELL;type=VOICE;waid=${OWNER_NUMBER}:+${OWNER_NUMBER}\n` +
                            'END:VCARD';

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
                }, { quoted: serialized });
                break;

            case 'clone':
            case 'c':
                if (serialized.sender === OWNER_NUMBER + '@s.whatsapp.net') {
                    await cloneBot(sock, serialized);
                } else {
                    await replyMessage(sock, serialized, '❌ Only owner can use this command!' + WATERMARK);
                }
                break;

            default:
                await replyMessage(sock, serialized, '❌ Unknown command! Use .menu to see available commands.' + WATERMARK);
        }
    } catch (error) {
        console.error('Error handling command:', error);
        await replyMessage(sock, serialized, '❌ An error occurred while processing your command' + WATERMARK);

        // Clear waiting response if error occurs
        if (waitingResponse.has(serialized.sender)) {
            waitingResponse.delete(serialized.sender);
        }
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
