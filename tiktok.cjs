const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');

// Bot Configuration
const config = {
    BOT_TOKEN: '7789525025:AAGRka7KkSIqaBV-Wki7-GqU8NWqWYm8DWA',
    ADMIN_IDS: ['5988451717']
};

// Inisialisasi bot
const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

// Simpan ID user sementara di memory (reset saat bot restart)
let activeUsers = new Set();

// Check admin
function isAdmin(userId) {
    return config.ADMIN_IDS.includes(userId.toString());
}

// Check membership
async function checkMembership(userId) {
    try {
        if (isAdmin(userId)) return true;
        const channels = ['@dagetfreenewnew', '@listprojec'];
        for (const channel of channels) {
            const member = await bot.getChatMember(channel, userId);
            if (member.status !== 'member') return false;
        }
        return true;
    } catch (error) {
        console.error('Membership check error:', error);
        return false;
    }
}

// Promotional messages array
const promoMessages = [
    `*🚀 Tingkatkan Bisnis Anda dengan Bot Telegram!*\n\n` +
    `\`Spesialis pembuatan bot Telegram profesional:\n` +
    `✓ Bot Customer Service\n` +
    `✓ Bot Downloader\n` +
    `✓ Bot Payment Gateway\n` +
    `✓ Bot Management\n` +
    `✓ Dan berbagai bot custom sesuai kebutuhan\n\n` +
    `💡 Konsultasi GRATIS\n` +
    `👨‍💻 Developer berpengalaman\n` +
    `⚡️ Pengerjaan cepat\n\n` +
    `Hubungi @hiyaok sekarang!\``,

    `*🤖 Butuh Bot Telegram Handal?*\n\n` +
    `\`Layanan pembuatan bot Telegram:\n` +
    `✓ Harga bersaing\n` +
    `✓ Fitur premium\n` +
    `✓ Support 24/7\n` +
    `✓ Free maintenance\n` +
    `✓ Source code diberikan\n\n` +
    `Buat botmu sekarang! Chat @hiyaok\``,

    `*💼 Special Offer Bot Telegram!*\n\n` +
    `\`Dapatkan bot Telegram berkualitas untuk:\n` +
    `✓ Otomatisasi bisnis\n` +
    `✓ Peningkatan penjualan\n` +
    `✓ Manajemen group/channel\n` +
    `✓ Sistem ticket & support\n` +
    `✓ Integrasi payment gateway\n\n` +
    `Limited Offer! Hubungi @hiyaok\``
];

// Schedule promotional messages
// Pagi (08:00)
cron.schedule('0 8 * * *', () => {
    broadcastPromo(0);
});

// Siang (13:00)
cron.schedule('0 13 * * *', () => {
    broadcastPromo(1);
});

// Malam (20:00)
cron.schedule('0 20 * * *', () => {
    broadcastPromo(2);
});

// Broadcast promotional message
async function broadcastPromo(messageIndex) {
    const message = promoMessages[messageIndex];
    for (const userId of activeUsers) {
        try {
            await bot.sendMessage(userId, message, { parse_mode: 'Markdown' });
            await new Promise(r => setTimeout(r, 100)); // Delay to avoid flood
        } catch (error) {
            console.error(`Failed to send promo to ${userId}:`, error.message);
            // Remove user if bot was blocked or chat not found
            if (error.response && error.response.statusCode === 403) {
                activeUsers.delete(userId);
            }
        }
    }
}

// Command /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    activeUsers.add(chatId); // Add user to active users

    const keyboard = {
        inline_keyboard: [
            [
                { text: '🔔 Join Channel', url: 't.me/dagetfreenewnew' },
                { text: '📋 Join ListProject', url: 't.me/listprojec' }
            ],
            [
                { text: '✅ Check Membership', callback_data: 'check_membership' }
            ]
        ]
    };

    const welcomeText = 
        '*Welcome to TikTok Downloader Bot* 🎥\n\n' +
        'Before using this bot, please:\n' +
        '1️⃣ Join our channel: @dagetfreenewnew\n' +
        '2️⃣ Join: @listprojec\n\n' +
        '_Send me any TikTok link to download!_ ✨';

    bot.sendMessage(chatId, welcomeText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
});

// Handle TikTok URLs
bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const url = msg.text;

    if (!url.match(/https?:\/\/(?:www\.)?tiktok\.com/)) return;
    activeUsers.add(chatId); // Add user to active users when they use the bot

    // Check membership kecuali admin
    if (!isAdmin(msg.from.id)) {
        const isMember = await checkMembership(msg.from.id);
        if (!isMember) {
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🔔 Join Channel', url: 't.me/dagetfreenewnew' },
                        { text: '📋 Join ListProject', url: 't.me/listprojec' }
                    ],
                    [
                        { text: '✅ Check Membership', callback_data: 'check_membership' }
                    ]
                ]
            };

            return bot.sendMessage(chatId,
                '*⚠️ Access Restricted*\n\n' +
                'You need to join our channels first:\n' +
                '1️⃣ @dagetfreenewnew\n' +
                '2️⃣ @listprojec\n\n' +
                '_Join and verify your membership!_ 🔄',
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        }
    }

    // Kirim pesan proses awal
    const processMsg = await bot.sendMessage(chatId, 
        '*🔍 Memeriksa URL TikTok...*',
        { parse_mode: 'Markdown' }
    );
    
    try {
        // Update: Fetching data
        await bot.editMessageText(
            '*📥 Mengambil data video...*',
            {
                chat_id: chatId,
                message_id: processMsg.message_id,
                parse_mode: 'Markdown'
            }
        );

        const response = await axios.get(`https://api.ryzendesu.vip/api/downloader/ttdl?url=${url}`);
        const data = response.data;

        if (data.success && data.data) {
            const videoData = data.data.data;
            
            // Update: Downloading
            await bot.editMessageText(
                '*⬇️ Mendownload video...*',
                {
                    chat_id: chatId,
                    message_id: processMsg.message_id,
                    parse_mode: 'Markdown'
                }
            );

            // Update: Uploading
            await bot.editMessageText(
                '*📤 Mengirim video ke Telegram...*',
                {
                    chat_id: chatId,
                    message_id: processMsg.message_id,
                    parse_mode: 'Markdown'
                }
            );

            const caption =
                `*📱 TikTok Video Downloaded!*\n\n` +
                `*👤 Creator:* \`${videoData.author.nickname}\`\n` +
                `*📝 Caption:* _${videoData.title}_\n\n` +
                `*📊 Stats:*\n` +
                `└ 👁 Views: \`${videoData.play_count.toLocaleString()}\`\n` +
                `└ ❤️ Likes: \`${videoData.digg_count.toLocaleString()}\`\n` +
                `└ 💭 Comments: \`${videoData.comment_count.toLocaleString()}\`\n` +
                `└ 🔄 Shares: \`${videoData.share_count.toLocaleString()}\`\n\n` +
                `*🤖 @YourBotUsername*`;

            // Delete process message and send video
            await bot.deleteMessage(chatId, processMsg.message_id);
            await bot.sendVideo(chatId, videoData.hdplay, {
                caption: caption,
                parse_mode: 'Markdown'
            });
        } else {
            throw new Error('Failed to process video');
        }
    } catch (error) {
        console.error('Download error:', error);
        bot.editMessageText(
            '*❌ Download Failed*\n\n' +
            '_Sorry, there was an error processing your request._\n' +
            'Please try again later! 🔄\n\n' +
            '*Error:* Invalid video or URL',
            {
                chat_id: chatId,
                message_id: processMsg.message_id,
                parse_mode: 'Markdown'
            }
        );
    }
});

// Handle callback queries
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;

    if (query.data === 'check_membership') {
        const isMember = await checkMembership(query.from.id);
        if (isMember) {
            await bot.answerCallbackQuery(query.id, {
                text: '✅ You are a member! You can use the bot now.',
                show_alert: true
            });
            await bot.deleteMessage(chatId, query.message.message_id);
        } else {
            await bot.answerCallbackQuery(query.id, {
                text: '❌ Please join both channels first!',
                show_alert: true
            });
        }
    }
});

// Error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

console.log('Bot is running...');
