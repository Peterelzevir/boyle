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

// Check membership function with improved error handling
async function checkMembership(userId) {
    try {
        if (isAdmin(userId)) return true;
        
        const channels = ['@dagetfreenewnew', '@listprojec'];
        
        for (const channel of channels) {
            try {
                const member = await bot.getChatMember(channel, userId);
                // Check for all valid member statuses
                const validStatuses = ['member', 'administrator', 'creator'];
                if (!validStatuses.includes(member.status)) {
                    console.log(`User ${userId} is not a member of ${channel}. Status: ${member.status}`);
                    return false;
                }
            } catch (channelError) {
                console.error(`Error checking membership for ${channel}:`, channelError);
                // If we can't verify membership, we assume they're not a member
                return false;
            }
        }
        
        return true;
    } catch (error) {
        console.error('General membership check error:', error);
        // If there's any error in the process, default to false for safety
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

function isTikTokUrl(url) {
    // Support more TikTok URL formats
    const tiktokPatterns = [
        /https?:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/,
        /https?:\/\/(?:www\.)?tiktok\.com\/t\/[\w-]+/,
        /https?:\/\/(?:www\.)?vm\.tiktok\.com\/[\w-]+/,
        /https?:\/\/(?:www\.)?vt\.tiktok\.com\/[\w-]+/,
        /https?:\/\/(?:www\.)?tiktok\.com\/.*?\/video\/\d+/,
        /https?:\/\/(?:[a-zA-Z0-9-]+\.)?tiktok\.com\/.*?\/\d+/
    ];
    
    console.log('Checking URL:', url);
    const isValid = tiktokPatterns.some(pattern => pattern.test(url));
    console.log('URL valid?', isValid);
    
    return isValid;
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

    console.log('Received message:', msg.text); // Debug log 1

    // Cek URL TikTok
    if (!isTikTokUrl(url)) {
        console.log('Not a TikTok URL'); // Debug log 2
        return;
    }

    console.log('Valid TikTok URL detected'); // Debug log 3
    activeUsers.add(chatId);

    // Check membership kecuali admin
    if (!isAdmin(msg.from.id)) {
        console.log('Checking membership...'); // Debug log 4
        const isMember = await checkMembership(msg.from.id);
        console.log('Membership status:', isMember); // Debug log 5

        if (!isMember) {
            console.log('User not a member'); // Debug log 6
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

    console.log('Starting download process...'); // Debug log 7

    // Kirim pesan proses awal
    const processMsg = await bot.sendMessage(chatId, 
        '*🔍 Memeriksa URL TikTok...*',
        { parse_mode: 'Markdown' }
    );
    
    try {
        console.log('Calling TikTok API...'); // Debug log 8
        
        // Update: Fetching data
        await bot.editMessageText(
            '*📥 Mengambil data video...*',
            {
                chat_id: chatId,
                message_id: processMsg.message_id,
                parse_mode: 'Markdown'
            }
        );

        const apiUrl = `https://api.ryzendesu.vip/api/downloader/ttdl?url=${encodeURIComponent(url)}`;
        console.log('API URL:', apiUrl); // Debug log 9

        const response = await axios.get(apiUrl);
        console.log('API Response:', response.data); // Debug log 10
        
        if (response.data.success) {
            const videoData = response.data.data.data;
            const hdplayUrl = videoData.hdplay;
            
            console.log('HD URL:', hdplayUrl); // Debug log 11

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
                `*🤖 @hiyaok*`;

            console.log('Sending video...'); // Debug log 12

            // Delete process message
            await bot.deleteMessage(chatId, processMsg.message_id);

            // Kirim video
            await bot.sendVideo(chatId, hdplayUrl, {
                caption: caption,
                parse_mode: 'Markdown'
            }).then(() => {
                console.log('Video sent successfully'); // Debug log 13
            }).catch((err) => {
                console.error('Error sending video:', err); // Debug log 14
            });

        } else {
            throw new Error('Failed to get video data');
        }
    } catch (error) {
        console.error('Download error:', error); // Debug log 15
        bot.editMessageText(
            '*❌ Download Failed*\n\n' +
            '_Sorry, there was an error processing your request._\n' +
            'Please try again later! 🔄\n\n' +
            `*Error:* ${error.message}`,
            {
                chat_id: chatId,
                message_id: processMsg.message_id,
                parse_mode: 'Markdown'
            }
        );
    }
});

// Modified callback query handler
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;

    if (query.data === 'check_membership') {
        try {
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
        } catch (error) {
            console.error('Error in callback query:', error);
            await bot.answerCallbackQuery(query.id, {
                text: '⚠️ Error checking membership. Please try again.',
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
