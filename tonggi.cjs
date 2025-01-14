// index.js
const { 
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    downloadMediaMessage
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const { writeFile } = require('fs/promises');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// Function to process image
async function processImage(buffer) {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    
    // Ensure width and height are within WhatsApp sticker limits (max 512px)
    const maxSize = 512;
    let width = metadata.width;
    let height = metadata.height;
    
    if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
    }
    
    return await image
        .resize(width, height, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .toBuffer();
}

// Function to process video
async function processVideo(inputBuffer) {
    const tempPath = `temp_${Date.now()}`;
    if (!fs.existsSync(tempPath)) {
        fs.mkdirSync(tempPath);
    }

    const inputFile = path.join(tempPath, 'input.mp4');
    const outputFile = path.join(tempPath, 'output.webp');
    
    try {
        // Write input buffer to temporary file
        fs.writeFileSync(inputFile, inputBuffer);
        
        // Convert video to WebP using FFmpeg
        await new Promise((resolve, reject) => {
            ffmpeg(inputFile)
                .addOutputOptions([
                    '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=12',
                    '-vcodec', 'libwebp',
                    '-lossless', '0',
                    '-compression_level', '6',
                    '-q:v', '50',
                    '-loop', '0',
                    '-preset', 'default',
                    '-an',
                    '-vsync', '0',
                    '-t', '5' // Limit to 5 seconds
                ])
                .toFormat('webp')
                .on('end', resolve)
                .on('error', reject)
                .save(outputFile);
        });

        // Read the processed file
        const processedBuffer = fs.readFileSync(outputFile);

        // Cleanup
        fs.unlinkSync(inputFile);
        fs.unlinkSync(outputFile);
        fs.rmdirSync(tempPath);

        return processedBuffer;
    } catch (error) {
        // Cleanup on error
        if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
        if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
        if (fs.existsSync(tempPath)) fs.rmdirSync(tempPath);
        throw error;
    }
}

// Function to handle connection
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: P({ level: 'silent' }),
        browser: ['Chrome (Linux)', '', ''] // Fix some connection issues
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to:', lastDisconnect?.error, 'Reconnecting:', shouldReconnect);
            
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('Connected to WhatsApp');
        }
    });

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        
        if (!msg.message) return;

        const messageType = Object.keys(msg.message)[0];
        
        // Check if message contains image or video
        if (messageType === 'imageMessage' || messageType === 'videoMessage') {
            try {
                console.log(`Received ${messageType}, converting to sticker...`);
                
                // Download the media
                const buffer = await downloadMediaMessage(
                    msg,
                    'buffer',
                    {},
                    { 
                        logger: P({ level: 'silent' }),
                        reuploadRequest: sock.updateMediaMessage
                    }
                );

                // Process media
                const processedBuffer = messageType === 'imageMessage' 
                    ? await processImage(buffer)
                    : await processVideo(buffer);

                // Create sticker with compatibility settings
                const sticker = new Sticker(processedBuffer, {
                    pack: 'boyle anak tonggi',
                    author: 'boyle anak tonggi',
                    type: messageType === 'videoMessage' ? StickerTypes.ANIMATED : StickerTypes.FULL,
                    categories: ['🤩'],
                    id: 'sticker-bot',
                    quality: 50,
                    background: '#00000000'
                });

                // Convert to buffer with better compatibility
                const stickerBuffer = await sticker.toBuffer();

                // Save sticker
                const filename = `sticker_${Date.now()}.webp`;
                await writeFile(path.join('stickers', filename), stickerBuffer);

                // Send sticker
                await sock.sendMessage(
                    msg.key.remoteJid,
                    { sticker: stickerBuffer }
                );

            } catch (error) {
                console.error('Error processing sticker:', error);
                await sock.sendMessage(
                    msg.key.remoteJid,
                    { text: 'Maaf, gagal membuat sticker. Silakan coba lagi.' }
                );
            }
        }
    });
}

// Create stickers directory if it doesn't exist
if (!fs.existsSync('./stickers')){
    fs.mkdirSync('./stickers');
}

// Start the bot
connectToWhatsApp().catch(err => console.log('Unexpected error:', err));
