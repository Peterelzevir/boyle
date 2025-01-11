const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { MongoClient, ServerApiVersion } = require('mongodb');

// Bot Configuration
const config = {
    BOT_TOKEN: '7789525025:AAGRka7KkSIqaBV-Wki7-GqU8NWqWYm8DWA',
    ADMIN_IDS: ['5988451717'],
    MONGODB_URI: 'mongodb+srv://jagoantech:CzlT09n27JA8JPVr@tiktokdown.ug4ex.mongodb.net/?retryWrites=true&w=majority&appName=tiktokdown'
};

// Inisialisasi bot
const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

// MongoDB Client
const client = new MongoClient(config.MONGODB_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let database;

// Connect to MongoDB
async function connectToMongo() {
    try {
        await client.connect();
        database = client.db("tiktokbot");
        console.log("Connected to MongoDB!");
    } catch (error) {
        console.error("MongoDB connection error:", error);
        process.exit(1);
    }
}

// Panggil fungsi koneksi
connectToMongo();

// Save user function
async function saveUser(msg) {
    try {
        if (!database) {
            console.log("Database connection not ready");
            return;
        }
        
        const users = database.collection('users');
        const userExists = await users.findOne({ userId: msg.from.id });
        
        if (!userExists) {
            await users.insertOne({
                userId: msg.from.id,
                username: msg.from.username,
                firstName: msg.from.first_name,
                lastName: msg.from.last_name,
                joinDate: new Date()
            });
            console.log('New user saved:', msg.from.id);
        }
    } catch (error) {
        console.error('Error saving user:', error);
    }
}

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

// Command /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    await saveUser(msg);

    const keyboard = {
        inline_keyboard: [
            [
                { text: '🔔 Join Channel', url: 't.me/dagetfreenewnew' },
                { text: '📋 Join ListProject', url: 't.me/listprojec' }
            ],
            [
                { text: '✅ Check Membership', callback_data: 'check_membership' }
            ],
            [
                { text: '📝 How to Use', callback_data: 'tutorial' },
                { text: '📞 Support', callback_data: 'support' }
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

// Admin Commands
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    const text = match[1];
    
    const users = await database.collection('users').find().toArray();
    let success = 0;
    let failed = 0;

    const progressMsg = await bot.sendMessage(msg.chat.id, '*📢 Broadcasting...*\n0%', 
        { parse_mode: 'Markdown' });

    for (let i = 0; i < users.length; i++) {
        try {
            await bot.sendMessage(users[i].userId, text, { parse_mode: 'Markdown' });
            success++;
        } catch (err) {
            failed++;
        }

        if (i % Math.ceil(users.length / 10) === 0) {
            const progress = Math.round((i / users.length) * 100);
            await bot.editMessageText(
                `*📢 Broadcasting...*\n${progress}%`, 
                {
                    chat_id: msg.chat.id,
                    message_id: progressMsg.message_id,
                    parse_mode: 'Markdown'
                }
            );
        }

        await new Promise(r => setTimeout(r, 50));
    }

    bot.editMessageText(
        `*Broadcast Selesai* 📢\n\n` +
        `✅ Berhasil: ${success}\n` +
        `❌ Gagal: ${failed}`,
        {
            chat_id: msg.chat.id,
            message_id: progressMsg.message_id,
            parse_mode: 'Markdown'
        }
    );
});

bot.onText(/\/stats/, async (msg) => {
    if (!isAdmin(msg.from.id)) return;
    
    const totalUsers = await database.collection('users').countDocuments();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayUsers = await database.collection('users').countDocuments({
        joinDate: { 
            $gte: todayStart,
            $lt: new Date()
        }
    });

    bot.sendMessage(msg.chat.id,
        '*Bot Statistics* 📊\n\n' +
        `*Total Users:* \`${totalUsers}\`\n` +
        `*New Today:* \`${todayUsers}\``,
        { parse_mode: 'Markdown' }
    );
});

// Handle TikTok URLs
bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const url = msg.text;

    if (!url.match(/https?:\/\/(?:www\.)?tiktok\.com/)) return;

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

    switch (query.data) {
        case 'check_membership':
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
            break;

        case 'tutorial':
            await bot.sendMessage(chatId,
                '*How to Use Bot* 📝\n\n' +
                '1. Join our channels\n' +
                '2. Copy TikTok video link\n' +
                '3. Send link to bot\n' +
                '4. Wait for download\n' +
                '5. Enjoy your video! 🎉\n\n' +
                '_Note: Make sure the video is public_',
                { parse_mode: 'Markdown' }
            );
            break;

        case 'support':
            await bot.sendMessage(chatId,
                '*Need Help?* 🆘\n\n' +
                'Contact admin: @AdminUsername\n' +
                'Channel: @dagetfreenewnew\n\n' +
                '_We will respond as soon as possible!_',
                { parse_mode: 'Markdown' }
            );
            break;
    }
});

// Error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    await client.close();
    process.exit(0);
});

// Error handling
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});
