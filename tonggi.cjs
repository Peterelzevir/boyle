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
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

// Function to process image to square
async function processImageToSquare(buffer) {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    
    const size = Math.min(Math.max(metadata.width, metadata.height), 512);
    
    return await image
        .resize(size, size, {
            fit: 'cover', // Changed to cover to fill the square
            position: 'center'
        })
        .toBuffer();
}

// Function to process video to square
function processVideoToSquare(inputBuffer) {
    return new Promise((resolve, reject) => {
        const tempInput = `temp_input_${Date.now()}.mp4`;
        const tempOutput = `temp_output_${Date.now()}.mp4`;
        
        fs.writeFileSync(tempInput, inputBuffer);
        
        ffmpeg(tempInput)
            .size('512x512')
            .addOptions([
                '-c:v libx264',
                '-crf 20',
                '-movflags faststart',
                '-pix_fmt yuv420p',
                '-vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512"' // Changed to crop for square output
            ])
            .toFormat('mp4')
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

// Function to handle connection
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: P({ level: 'silent' })
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

                // Process media to square format
                const processedBuffer = messageType === 'imageMessage' 
                    ? await processImageToSquare(buffer)
                    : await processVideoToSquare(buffer);

                // Create sticker
                const sticker = new Sticker(processedBuffer, {
                    pack: 'boyle anak tonggi',
                    author: 'boyle anak tonggi',
                    type: StickerTypes.FULL,
                    categories: ['🤩', '🎉'],
                    quality: 75, // Increased quality
                    crop: false // Disable additional cropping
                });

                // Convert to buffer
                const stickerBuffer = await sticker.toBuffer();

                // Save sticker locally
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
                    { text: 'Maaf, gagal membuat sticker.' }
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
