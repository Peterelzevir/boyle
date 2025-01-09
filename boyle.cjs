const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const axios = require('axios');
const fs = require('fs');
const { writeFile } = require('fs/promises');
const { exec } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Bot Configuration
const config = {
    botNumber: '628972538700', // Ganti dengan nomor WhatsApp bot
    ownerNumber: '628972538700', // Ganti dengan nomor owner
    usePairingCode: false, // true = pairing code, false = QR code
}

const prefixList = ['#', '!', '.', '$', '/'];

// Function to start the WhatsApp bot
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('PetBot');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: !config.usePairingCode,
        browser: ['PETBOT', 'Safari', '1.0.0'],
        logger: pino({ level: 'silent' })
    });

    // Save credentials whenever updated
    sock.ev.on('creds.update', saveCreds);

    // Handle pairing code
    if (config.usePairingCode && !sock.authState.creds.registered) {
        const phoneNumber = config.botNumber.startsWith('62') ? config.botNumber : '62' + config.botNumber;
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`\n✨ Pairing code: ${code}\n`);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('\n✅ PETBOT Connected Successfully!\n');
        }
    });

    // Message handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const type = Object.keys(msg.message)[0];
        const quoted = msg.message[type]?.contextInfo?.quotedMessage;
        const body = type === 'conversation' ? msg.message.conversation :
                    type === 'extendedTextMessage' ? msg.message.extendedTextMessage.text : '';

        // Helper function to send message with auto-delete processing message
        const reply = async (text, options = {}) => {
            const processingMsg = await sock.sendMessage(from, { text }, { quoted: msg });
            if (options.isProcess) {
                setTimeout(async () => {
                    await sock.sendMessage(from, { delete: processingMsg.key });
                }, options.delay || 3000);
            }
            return processingMsg;
        };

        // Check if message contains any prefix or no prefix
        let cmd = '';
        let prefix = '';

        for (let pfx of prefixList) {
            if (body.startsWith(pfx)) {
                prefix = pfx;
                cmd = body.slice(pfx.length).trim();
                break;
            }
        }

        if (!prefix) {
            cmd = body.trim();
        }

        // Menu command
        if (cmd.toLowerCase() === 'menu') {
            const menuText = `╭━━━━『 *PETBOT MENU* 』━━━━╮
┃
┃ *BOT INFO*
┃ Prefix: Multi/No Prefix
┃ Mode: Public
┃ Owner: wa.me/${config.ownerNumber}
┃
┃ *CONVERTER*
┃ ◦ sticker [image/video/gif]
┃ ◦ toimg [sticker]
┃
┃ *DOWNLOADER*
┃ ◦ ig [url]
┃ ◦ tiktok [url]
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯

_Powered by @boyle dark sistem_`;

            reply(menuText);
        }

        // Sticker creation (support for caption and reply)
        const isMediaMessage = type === 'imageMessage' || type === 'videoMessage';
        const isQuotedMedia = quoted && (quoted.imageMessage || quoted.videoMessage);

        if ((isMediaMessage || isQuotedMedia) && cmd.toLowerCase() === 'sticker') {
            const processingMsg = await reply('⏳ Converting to sticker...', { isProcess: true });
            try {
                const media = isMediaMessage ? 
                    await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) }) :
                    await downloadMediaMessage({ message: quoted }, 'buffer', {}, { logger: pino({ level: 'silent' }) });

                const fileName = `temp_${Date.now()}.${isMediaMessage ? 
                    (type === 'imageMessage' ? 'jpg' : 'mp4') : 
                    (quoted.imageMessage ? 'jpg' : 'mp4')}`;
                await writeFile(fileName, media);

                const stickerFile = `sticker_${Date.now()}.webp`;
                
                if (fileName.endsWith('.jpg')) {
                    await execAsync(`ffmpeg -i ${fileName} -vf scale=512:512 ${stickerFile}`);
                } else {
                    await execAsync(`ffmpeg -i ${fileName} -vf scale=512:512 -t 10 -c:v libwebp -lossless 1 -qscale 1 -preset default -loop 0 -an -vsync 0 ${stickerFile}`);
                }

                await sock.sendMessage(from, { 
                    sticker: { url: stickerFile },
                    packname: "boyle dark sistem",
                    author: "boyle dark sistem"
                });

                // Cleanup
                fs.unlinkSync(fileName);
                fs.unlinkSync(stickerFile);
                await sock.sendMessage(from, { delete: processingMsg.key });
                await reply('✅ Sticker created successfully!', { isProcess: true, delay: 2000 });
            } catch (error) {
                console.error(error);
                await sock.sendMessage(from, { delete: processingMsg.key });
                reply('❌ Failed to create sticker. Please try again.');
            }
        }

        // Convert sticker to image (support for reply)
        if (cmd.toLowerCase() === 'toimg') {
            const isSticker = type === 'stickerMessage' || (quoted && quoted.stickerMessage);
            if (!isSticker) {
                return reply('❌ Please reply to a sticker!');
            }

            const processingMsg = await reply('⏳ Converting sticker to image...', { isProcess: true });
            try {
                const media = type === 'stickerMessage' ?
                    await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) }) :
                    await downloadMediaMessage({ message: quoted }, 'buffer', {}, { logger: pino({ level: 'silent' }) });

                const fileName = `temp_${Date.now()}.webp`;
                await writeFile(fileName, media);

                const imageFile = `image_${Date.now()}.png`;
                await execAsync(`ffmpeg -i ${fileName} ${imageFile}`);

                await sock.sendMessage(from, { 
                    image: { url: imageFile },
                    caption: '✨ Here\'s your image!'
                });

                // Cleanup
                fs.unlinkSync(fileName);
                fs.unlinkSync(imageFile);
                await sock.sendMessage(from, { delete: processingMsg.key });
                await reply('✅ Image converted successfully!', { isProcess: true, delay: 2000 });
            } catch (error) {
                console.error(error);
                await sock.sendMessage(from, { delete: processingMsg.key });
                reply('❌ Failed to convert sticker. Please try again.');
            }
        }

        // Instagram downloader
        if (cmd.toLowerCase().startsWith('ig ')) {
            const url = cmd.slice(3);
            const processingMsg = await reply('⏳ Downloading Instagram content...', { isProcess: true });
            try {
                const response = await axios.get(`https://api.ryzendesu.vip/api/downloader/igdl?url=${url}`);
                const videoUrl = response.data.url;
                await sock.sendMessage(from, { 
                    video: { url: videoUrl },
                    caption: '✨ Here\'s your Instagram video!'
                });
                await sock.sendMessage(from, { delete: processingMsg.key });
                await reply('✅ Instagram download completed!', { isProcess: true, delay: 2000 });
            } catch (error) {
                console.error(error);
                await sock.sendMessage(from, { delete: processingMsg.key });
                reply('❌ Failed to download Instagram video. Please check the URL and try again.');
            }
        }

        // TikTok downloader
        if (cmd.toLowerCase().startsWith('tiktok ')) {
            const url = cmd.slice(7);
            const processingMsg = await reply('⏳ Downloading TikTok video...', { isProcess: true });
            try {
                const response = await axios.get(`https://api.ryzendesu.vip/api/downloader/ttdl?url=${url}`);
                const videoUrl = response.data.hdplay;
                await sock.sendMessage(from, { 
                    video: { url: videoUrl },
                    caption: '✨ Here\'s your TikTok video!'
                });
                await sock.sendMessage(from, { delete: processingMsg.key });
                await reply('✅ TikTok download completed!', { isProcess: true, delay: 2000 });
            } catch (error) {
                console.error(error);
                await sock.sendMessage(from, { delete: processingMsg.key });
                reply('❌ Failed to download TikTok video. Please check the URL and try again.');
            }
        }
    });
}

// Start the bot
startBot();
