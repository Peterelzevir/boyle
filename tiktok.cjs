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

// Simpan ID user sementara di memory
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
    `*🚀 Jasa Pembuatan Bot Telegram*\n\n` +
    `\`Spesialis bot Telegram profesional:\n` +
    `✓ Bot Downloader (TikTok, IG, FB)\n` +
    `✓ Bot Support & Ticket\n` +
    `✓ Bot Payment Gateway\n` +
    `✓ Bot Manajemen Group/Channel\n` +
    `✓ Bot Custom sesuai kebutuhan\n\n` +
    `💡 Free konsultasi\n` +
    `⚡️ Proses cepat\n` +
    `🔧 Free maintenance\n\n` +
    `Order sekarang! Hubungi @hiyaok\``,

    `*💼 Professional Telegram Bot Service*\n\n` +
    `\`Layanan jasa pembuatan bot:\n` +
    `✓ Source code diberikan\n` +
    `✓ Berpengalaman\n` +
    `✓ Support 24/7\n` +
    `✓ Harga bersahabat\n` +
    `✓ Revisi sampai puas\n\n` +
    `Limited slot! Chat @hiyaok\``,

    `*🌟 Upgrade Bisnis Anda dengan Bot*\n\n` +
    `\`Bot Telegram untuk:\n` +
    `✓ Auto responder\n` +
    `✓ Digital product seller\n` +
    `✓ Admin Group/Channel\n` +
    `✓ Customer service\n` +
    `✓ Payment automation\n\n` +
    `Info lebih lanjut: @hiyaok\``
];

// Schedule promotional messages
cron.schedule('0 8 * * *', () => broadcastPromo(0));  // 08:00
cron.schedule('0 13 * * *', () => broadcastPromo(1)); // 13:00
cron.schedule('0 20 * * *', () => broadcastPromo(2)); // 20:00

// Broadcast promotional message
async function broadcastPromo(messageIndex) {
    const message = promoMessages[messageIndex];
    for (const userId of activeUsers) {
        try {
            await bot.sendMessage(userId, message, { parse_mode: 'Markdown' });
            await new Promise(r => setTimeout(r, 100)); // Delay to avoid flood
        } catch (error) {
            console.error(`Failed to send promo to ${userId}:`, error.message);
            if (error.response && error.response.statusCode === 403) {
                activeUsers.delete(userId);
            }
        }
    }
}

// Fungsi untuk validasi URL TikTok
function isTikTokUrl(url) {
    const tiktokPatterns = [
        /https?:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/,
        /https?:\/\/(?:www\.)?tiktok\.com\/t\/[\w-]+/,
        /https?:\/\/(?:www\.)?vm\.tiktok\.com\/[\w-]+/
    ];
    return tiktokPatterns.some(pattern => pattern.test(url));
}

// Command /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    activeUsers.add(chatId);

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

    if (!isTikTokUrl(url)) return;
    activeUsers.add(chatId);

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

        const response = await axios.get(`https://api.ryzendesu.vip/api/downloader/ttdl?url=${encodeURIComponent(url)}`);
        
        if (response.data.success) {
            const videoData = response.data.data.data;
            const hdplayUrl = videoData.hdplay;
            
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
                `*🤖 @downloadertiktokrobot*`;

            // Delete process message
            await bot.deleteMessage(chatId, processMsg.message_id);

            // Kirim video
            await bot.sendVideo(chatId, hdplayUrl, {
                caption: caption,
                parse_mode: 'Markdown'
            });
        } else {
            throw new Error('Failed to get video data');
        }
    } catch (error) {
        console.error('Error:', error);
        bot.editMessageText(
            '*❌ Download Failed*\n\n' +
            '_Sorry, there was an error processing your request._\n' +
            'Please try again later! 🔄',
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

// Handle shutdown
process.on('SIGINT', () => {
    bot.stopPolling();
    process.exit(0);
});

console.log('Bot is running...');
