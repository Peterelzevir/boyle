const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');

// Bot Configuration
const config = {
    BOT_TOKEN: '7431538722:AAGwEurQCu49_XsO6q2_UxVKeVE1_zq_X5g',
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

function isInstagramUrl(url) {
    const instagramPatterns = [
        /https?:\/\/(?:www\.)?instagram\.com\/p\/[\w-]+/,
        /https?:\/\/(?:www\.)?instagram\.com\/reel\/[\w-]+/,
        /https?:\/\/(?:www\.)?instagram\.com\/stories\/[\w-]+/,
        /https?:\/\/(?:www\.)?instagram\.com\/tv\/[\w-]+/,
        /https?:\/\/(?:www\.)?instagr\.am\/p\/[\w-]+/
    ];
    return instagramPatterns.some(pattern => pattern.test(url));
}

// Handle Instagram URLs
bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const url = msg.text;

    if (!isInstagramUrl(url)) {
        return;
    }

    activeUsers.add(chatId);

    // Check membership
    if (!isAdmin(msg.from.id)) {
        try {
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
        } catch (error) {
            console.error('Membership check error:', error);
            return bot.sendMessage(chatId, 
                '*⚠️ Error checking membership*\nPlease try again later.',
                { parse_mode: 'Markdown' }
            );
        }
    }

    // Send initial processing message
    const processMsg = await bot.sendMessage(chatId, 
        '*🔍 Processing Instagram URL...*',
        { parse_mode: 'Markdown' }
    );

    try {
        // Update status: Fetching data
        await bot.editMessageText(
            '*📥 Fetching media data...*',
            {
                chat_id: chatId,
                message_id: processMsg.message_id,
                parse_mode: 'Markdown'
            }
        );

        // Make API request
        const apiUrl = `https://api.ryzendesu.vip/api/downloader/igdl?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl, {
            headers: {
                'accept': 'application/json'
            }
        });

        if (response.data.success && response.data.data) {
            const mediaUrls = response.data.data;

            // Update status: Downloading
            await bot.editMessageText(
                '*⬇️ Downloading media...*',
                {
                    chat_id: chatId,
                    message_id: processMsg.message_id,
                    parse_mode: 'Markdown'
                }
            );

            // Delete processing message
            await bot.deleteMessage(chatId, processMsg.message_id);

            // Send all media files
            for (let i = 0; i < mediaUrls.length; i++) {
                const mediaUrl = mediaUrls[i].url;
                const isLastItem = i === mediaUrls.length - 1;
                
                // Determine if it's a video or photo based on URL or type
                const isVideo = mediaUrl.includes('.mp4') || mediaUrls[i].type === 'video';
                
                // Prepare caption (only for single media or last item in multiple media)
                const caption = (mediaUrls.length === 1 || isLastItem) ? 
                    '```Downloaded by @hiyaok & @downloaderinstarobot```' : 
                    '';

                try {
                    if (isVideo) {
                        await bot.sendVideo(chatId, mediaUrl, {
                            caption: caption,
                            parse_mode: 'Markdown'
                        });
                    } else {
                        await bot.sendPhoto(chatId, mediaUrl, {
                            caption: caption,
                            parse_mode: 'Markdown'
                        });
                    }
                    
                    // Add small delay between sending multiple media
                    if (!isLastItem) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (mediaError) {
                    console.error('Error sending media:', mediaError);
                    await bot.sendMessage(chatId,
                        '*❌ Failed to send some media*\nPlease try again later.',
                        { parse_mode: 'Markdown' }
                    );
                }
            }
        } else {
            throw new Error('Failed to get media data');
        }
    } catch (error) {
        console.error('Download error:', error);
        
        // Update error message
        await bot.editMessageText(
            '```*❌ Download Failed*```\n\n' +
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
        '*Welcome to Insta Downloader Bot* 🎥\n\n' +
        'Before using this bot, please:\n' +
        '1️⃣ Join our channel: @dagetfreenewnew\n' +
        '2️⃣ Join: @listprojec\n\n' +
        '_Send me any Instagram link to download!_ ✨';

    bot.sendMessage(chatId, welcomeText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
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
