// index.js
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    downloadMediaMessage
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const axios = require('axios');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

// Queue System
class ProcessingQueue {
    constructor() {
        this.queues = new Map();
    }

    async addTask(chatId, task) {
        if (!this.queues.has(chatId)) {
            this.queues.set(chatId, []);
        }
        const queue = this.queues.get(chatId);
        queue.push(task);

        if (queue.length === 1) {
            await this.processQueue(chatId);
        }
    }

    async processQueue(chatId) {
        const queue = this.queues.get(chatId);
        while (queue && queue.length > 0) {
            const task = queue[0];
            try {
                await task();
            } catch (err) {
                console.error(`Error processing task for ${chatId}:`, err);
            }
            queue.shift();
        }
        if (queue.length === 0) {
            this.queues.delete(chatId);
        }
    }
}

// Create directories if they don't exist
const createRequiredDirectories = () => {
    const dirs = ['./auth', './temp', './stickers'];
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
};

// Clean temp directory
const cleanTempDirectory = () => {
    const tempDir = './temp';
    if (fs.existsSync(tempDir)) {
        fs.readdirSync(tempDir).forEach(file => {
            const filePath = path.join(tempDir, file);
            fs.unlinkSync(filePath);
        });
    }
};

// Process image for sticker
async function processImageForSticker(buffer) {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    
    const maxSize = 512;
    let width = metadata.width;
    let height = metadata.height;
    
    if (width > maxSize || height > maxSize) {
        if (width > height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
        } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
        }
    }

    const processedImage = await image
        .resize(width, height, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp({ quality: 100 })
        .toBuffer();

    return processedImage;
}

// Process video for sticker
function processVideoForSticker(inputBuffer) {
    return new Promise((resolve, reject) => {
        const tempInput = path.join('./temp', `input_${Date.now()}.mp4`);
        const tempOutput = path.join('./temp', `output_${Date.now()}.webp`);

        fs.writeFileSync(tempInput, inputBuffer);

        ffmpeg(tempInput)
            .addOutputOptions([
                '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15',
                '-vcodec', 'libwebp',
                '-lossless', '1',
                '-qscale', '1',
                '-preset', 'best',
                '-loop', '0',
                '-vs', '0',
                '-t', '10',
                '-an'
            ])
            .toFormat('webp')
            .on('end', () => {
                const outputBuffer = fs.readFileSync(tempOutput);
                fs.unlinkSync(tempInput);
                fs.unlinkSync(tempOutput);
                resolve(outputBuffer);
            })
            .on('error', (err) => {
                if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
                if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
                reject(err);
            })
            .save(tempOutput);
    });
}

// Create sticker
async function createSticker(buffer, isVideo = false) {
    const stickerMetadata = {
        type: isVideo ? StickerTypes.ANIMATED : StickerTypes.DEFAULT,
        pack: 'boyle anak tonggi',
        author: 'boyle anak tonggi',
        categories: ['🤩'],
        quality: 100
    };

    const sticker = new Sticker(buffer, stickerMetadata);
    return await sticker.toBuffer();
}

// Download TikTok video
async function downloadTikTok(url) {
    try {
        const apiUrl = `https://api.ryzendesu.vip/api/downloader/ttdl?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl, {
            headers: { accept: 'application/json' },
            timeout: 30000
        });

        if (!response.data?.data?.hdplay) {
            throw new Error('Video URL not found in API response');
        }

        const videoUrl = response.data.data.hdplay;
        const videoResponse = await axios.get(videoUrl, {
            responseType: 'arraybuffer',
            timeout: 30000
        });

        return Buffer.from(videoResponse.data);
    } catch (error) {
        console.error('TikTok download error:', error);
        throw error;
    }
}

// Main WhatsApp connection function
async function connectToWhatsApp() {
    const queue = new ProcessingQueue();
    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ['Chrome (Linux)', '', ''],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 10000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to:', lastDisconnect?.error, 'Reconnecting:', shouldReconnect);
            
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('WhatsApp bot connected successfully!');
        }
    });

    sock.ev.on('messages.upsert', ({ messages }) => {
        const msg = messages[0];
        if (!msg?.message) return;

        const chatId = msg.key.remoteJid;
        const messageType = Object.keys(msg.message)[0];
        const messageContent = msg.message[messageType];

        // Handle message processing
        queue.addTask(chatId, async () => {
            try {
                // Handle TikTok URLs
                if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
                    const text = messageType === 'conversation' ? messageContent : messageContent.text;
                    const tiktokRegex = /https?:\/\/((?:vm|vt|www)\.)?tiktok\.com\/[^\s]+/i;

                    if (tiktokRegex.test(text)) {
                        const url = text.match(tiktokRegex)[0];
                        await sock.sendMessage(chatId, { text: 'Sedang mengunduh video TikTok...' });

                        try {
                            const videoBuffer = await downloadTikTok(url);
                            await sock.sendMessage(chatId, {
                                video: videoBuffer,
                                caption: '✅ Download berhasil!'
                            });
                        } catch (error) {
                            await sock.sendMessage(chatId, {
                                text: '❌ Gagal mengunduh video TikTok. Silakan coba lagi.'
                            });
                        }
                        return;
                    }
                }

                // Handle media to sticker conversion
                if (messageType === 'imageMessage' || messageType === 'videoMessage') {
                    await sock.sendMessage(chatId, { text: 'Sedang membuat sticker...' });

                    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { 
                        logger: pino({ level: 'silent' }),
                        reuploadRequest: sock.updateMediaMessage
                    });

                    const processedBuffer = messageType === 'imageMessage'
                        ? await processImageForSticker(buffer)
                        : await processVideoForSticker(buffer);

                    const stickerBuffer = await createSticker(processedBuffer, messageType === 'videoMessage');

                    await sock.sendMessage(chatId, { sticker: stickerBuffer });
                }
            } catch (error) {
                console.error('Error processing message:', error);
                await sock.sendMessage(chatId, {
                    text: '❌ Terjadi kesalahan. Silakan coba lagi.'
                });
            }
        });
    });
}

// Initialize and start the bot
async function startBot() {
    try {
        createRequiredDirectories();
        cleanTempDirectory();
        await connectToWhatsApp();
    } catch (error) {
        console.error('Failed to start bot:', error);
        process.exit(1);
    }
}

startBot();

// Clean up on exit
process.on('SIGINT', async () => {
    console.log('Cleaning up...');
    cleanTempDirectory();
    process.exit(0);
});
