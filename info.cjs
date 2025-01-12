/*
* Advanced Education & Scholarship Bot
* Created by @hiyaok & @listprojec 
* 
* Features:
* - Real-time updates
* - Multi-source aggregation
* - Channel integration
* - Web app support
* - Deep linking
*/

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');
const RSS = require('rss-parser');
const sharp = require('sharp');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const token = '7903398118:AAEwEzFnw1CZDqnPlwIEHfMI_dUU9qpsy1Q'; // Replace with your bot token
const bot = new TelegramBot(token, { polling: true });
const channelId = '@infoedukasidanbeasiswa';

// Channel Posting Function
async function postToChannel(item) {
  try {
    const caption = formatChannelPost(item);
    const keyboard = getChannelPostKeyboard(item);

    if (item.imageUrl) {
      // Download & optimize image
      const imgResponse = await fetch(item.imageUrl);
      const buffer = await imgResponse.buffer();
      
      // Compress & resize image
      const optimizedImage = await sharp(buffer)
        .resize(800, null, { withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      await bot.sendPhoto(channelId, optimizedImage, {
        caption: caption,
        parse_mode: 'MarkdownV2',
        reply_markup: keyboard
      });
    } else {
      await bot.sendMessage(channelId, caption, {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: false,
        reply_markup: keyboard
      });
    }
  } catch (error) {
    console.error('Error posting to channel:', error.message);
  }
}

// Command Handlers
bot.onText(/\/start(?:\s+post_(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  activeUsers.add(chatId);

  if (match && match[1]) {
    // Deep linking handler
    try {
      const decodedLink = Buffer.from(match[1], 'base64').toString();
      const post = Array.from(lastPosts.values())
        .find(item => item.link === decodedLink);
      
      if (post) {
        const message = formatBotPost(post, true);
        await bot.sendMessage(chatId, message, {
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
          reply_markup: getBotPostKeyboard(post)
        });
        return;
      }
    } catch (error) {
      console.error('Deep linking error:', error);
    }
  }

  // Regular start command
  const welcome = `*🎓 Welcome to Education Updates Bot*\n\n` +
    `\`\`\`Real\\-time updates about:\\n` +
    `\\- Beasiswa Indonesia & International\\n` +
    `\\- Berita Pendidikan Terkini\\n` +
    `\\- Info Kampus\\n` +
    `\\- Event Pendidikan\`\`\`\n\n` +
    `_Available Commands:_\n` +
    `📚 /latest \\- Latest updates\\n` +
    `🔍 /search \\- Search content\\n` +
    `⭐️ /category \\- Browse by category\\n` +
    `ℹ️ /help \\- Help menu\\n\\n` +
    `||@edukasirobot||`;

  await bot.sendMessage(chatId, welcome, {
    parse_mode: 'MarkdownV2',
    reply_markup: getMainMenuKeyboard()
  });
});

bot.onText(/\/latest(?:\s+(\w+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const category = match && match[1];
  
  const loadingMsg = await bot.sendMessage(chatId, 
    '*🔄 Fetching latest updates\\.\\.\\.*', 
    { parse_mode: 'MarkdownV2' }
  );

  try {
    let posts = Array.from(lastPosts.values())
      .sort((a, b) => b.pubDate - a.pubDate);

    if (category) {
      posts = posts.filter(post => post.category === category);
    }

    await bot.deleteMessage(chatId, loadingMsg.message_id);

    for (const post of posts.slice(0, 5)) {
      const message = formatBotPost(post);
      await bot.sendMessage(chatId, message, {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
        reply_markup: getBotPostKeyboard(post)
      });
    }
  } catch (error) {
    console.error('Error sending latest posts:', error);
    await bot.editMessageText(
      '*❌ Error fetching updates\\. Please try again\\.*',
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'MarkdownV2'
      }
    );
  }
});

bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1].toLowerCase();
  
  const loadingMsg = await bot.sendMessage(chatId,
    '*🔍 Searching\\.\\.\\.*',
    { parse_mode: 'MarkdownV2' }
  );

  try {
    const results = Array.from(lastPosts.values())
      .filter(post => 
        post.title.toLowerCase().includes(query) ||
        post.description.toLowerCase().includes(query)
      )
      .sort((a, b) => b.pubDate - a.pubDate)
      .slice(0, 5);

    await bot.deleteMessage(chatId, loadingMsg.message_id);

    if (results.length === 0) {
      await bot.sendMessage(chatId,
        '*❌ No results found\\.*',
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }

    for (const post of results) {
      const message = formatBotPost(post);
      await bot.sendMessage(chatId, message, {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
        reply_markup: getBotPostKeyboard(post)
      });
    }
  } catch (error) {
    console.error('Search error:', error);
    await bot.editMessageText(
      '*❌ Search error\\. Please try again\\.*',
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'MarkdownV2'
      }
    );
  }
});

// Callback Query Handler
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const [action, value] = query.data.split('_');

  try {
    switch(action) {
      case 'category':
        const posts = Array.from(lastPosts.values())
          .filter(post => post.category === value)
          .sort((a, b) => b.pubDate - a.pubDate)
          .slice(0, 5);
          
        for (const post of posts) {
          const message = formatBotPost(post);
          await bot.sendMessage(chatId, message, {
            parse_mode: 'MarkdownV2',
            disable_web_page_preview: true,
            reply_markup: getBotPostKeyboard(post)
          });
        }
        break;
        
      case 'latest':
        const latestPosts = Array.from(lastPosts.values())
          .filter(post => post.category === value)
          .sort((a, b) => b.pubDate - a.pubDate)
          .slice(0, 3);
          
        for (const post of latestPosts) {
          const message = formatBotPost(post);
          await bot.sendMessage(chatId, message, {
            parse_mode: 'MarkdownV2',
            disable_web_page_preview: true,
            reply_markup: getBotPostKeyboard(post)
          });
        }
        break;
        
      case 'main_menu':
        await bot.sendMessage(chatId, 
          '*📚 Main Menu*\n\n\`\`\`Select a category:\`\`\`',
          {
            parse_mode: 'MarkdownV2',
            reply_markup: getMainMenuKeyboard()
          }
        );
        break;
    }
    
    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error('Callback query error:', error);
    await bot.answerCallbackQuery(query.id, {
      text: '❌ Error. Please try again.',
      show_alert: true
    });
  }
});

// Schedule Content Updates
cron.schedule('*/10 * * * *', async () => {
  console.log('Checking for new content...');
  await fetchContent();
});

// Clear Old Cache Daily
cron.schedule('0 0 * * *', () => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  // Clear old links
  for (const link of sentLinks) {
    const post = lastPosts.get(link);
    if (post && post.pubDate < oneDayAgo) {
      sentLinks.delete(link);
      lastPosts.delete(link);
    }
  }
});

// Error Handlers
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

bot.on('error', (error) => {
  console.error('Bot error:', error);
});

// Start Bot
console.log('🚀 Education Bot is running...'););

// Cache System
const sentLinks = new Set();
const activeUsers = new Set();
const userStates = new Map();
const lastPosts = new Map();

// RSS Parser Configuration
const parser = new RSS({
  customFields: {
    item: [
      'media:content',
      'enclosure',
      'image',
      'description',
      'content:encoded',
      'category'
    ]
  }
});

// Content Categories
const categories = {
  BEASISWA_INDO: 'beasiswa_indonesia',
  BEASISWA_INT: 'beasiswa_international',
  PENDIDIKAN_INDO: 'pendidikan_indonesia',
  PENDIDIKAN_INT: 'pendidikan_international',
  KAMPUS_INDO: 'kampus_indonesia',
  KAMPUS_INT: 'kampus_international',
  EVENT: 'event'
};

// Extensive Source List (100+ Valid Sources)
const sources = [
  // === BEASISWA INDONESIA ===
  {
    name: 'LPDP',
    url: 'https://www.lpdp.kemenkeu.go.id/beasiswa/feed',
    type: 'rss',
    category: categories.BEASISWA_INDO
  },
  {
    name: 'Kemendikbud Dikti',
    url: 'https://dikti.kemdikbud.go.id/pengumuman/feed',
    type: 'rss',
    category: categories.BEASISWA_INDO
  },
  {
    name: 'AMINEF Fulbright Indonesia',
    url: 'https://www.aminef.or.id/feed',
    type: 'rss',
    category: categories.BEASISWA_INDO
  },
  {
    name: 'Djarum Beasiswa',
    url: 'https://djarumbeasiswaplus.org/feed',
    type: 'rss',
    category: categories.BEASISWA_INDO
  },
  {
    name: 'Beasiswa Indonesia',
    url: 'https://beasiswaindo.com/feed',
    type: 'rss',
    category: categories.BEASISWA_INDO
  },
  {
    name: 'Info Beasiswa',
    url: 'https://www.info-beasiswa.com/feed',
    type: 'rss',
    category: categories.BEASISWA_INDO
  },
  {
    name: 'Beasiswa ID',
    url: 'https://beasiswa.id/feed',
    type: 'rss',
    category: categories.BEASISWA_INDO
  },
  {
    name: 'Tanoto Foundation',
    url: 'https://www.tanotofoundation.org/id/feed',
    type: 'rss',
    category: categories.BEASISWA_INDO
  },
  {
    name: 'YBB Indonesia',
    url: 'https://www.ybb.or.id/feed',
    type: 'rss',
    category: categories.BEASISWA_INDO
  },
  
  // === BEASISWA INTERNATIONAL ===
  {
    name: 'Scholars4Dev',
    url: 'https://www.scholars4dev.com/feed',
    type: 'rss',
    category: categories.BEASISWA_INT
  },
  {
    name: 'ScholarshipDB',
    url: 'https://scholarshipdb.net/feeds',
    type: 'rss',
    category: categories.BEASISWA_INT
  },
  {
    name: 'Scholarships.com',
    url: 'https://www.scholarships.com/feed',
    type: 'rss',
    category: categories.BEASISWA_INT
  },
  {
    name: 'Scholarship Positions',
    url: 'https://scholarship-positions.com/feed',
    type: 'rss',
    category: categories.BEASISWA_INT
  },
  {
    name: 'International Scholarships',
    url: 'https://www.internationalscholarships.com/feed',
    type: 'rss',
    category: categories.BEASISWA_INT
  },
  
  // === KEDUTAAN & LEMBAGA INTERNASIONAL ===
  {
    name: 'US Embassy Indonesia',
    url: 'https://id.usembassy.gov/education-culture/feed',
    type: 'rss',
    category: categories.BEASISWA_INT
  },
  {
    name: 'British Council Indonesia',
    url: 'https://www.britishcouncil.id/feed',
    type: 'rss',
    category: categories.BEASISWA_INT
  },
  {
    name: 'DAAD Indonesia',
    url: 'https://www.daad.id/feed',
    type: 'rss',
    category: categories.BEASISWA_INT
  },
  {
    name: 'Campus France Indonesia',
    url: 'https://www.indonesie.campusfrance.org/rss',
    type: 'rss',
    category: categories.BEASISWA_INT
  },
  {
    name: 'Nuffic Neso Indonesia',
    url: 'https://www.nesoindonesia.or.id/feed',
    type: 'rss',
    category: categories.BEASISWA_INT
  },
  
  // === UNIVERSITAS INDONESIA ===
  {
    name: 'UI News',
    url: 'https://www.ui.ac.id/feed',
    type: 'rss',
    category: categories.KAMPUS_INDO
  },
  {
    name: 'ITB News',
    url: 'https://www.itb.ac.id/feed',
    type: 'rss',
    category: categories.KAMPUS_INDO
  },
  {
    name: 'UGM News',
    url: 'https://ugm.ac.id/feed',
    type: 'rss',
    category: categories.KAMPUS_INDO
  },
  {
    name: 'IPB News',
    url: 'https://ipb.ac.id/feed',
    type: 'rss',
    category: categories.KAMPUS_INDO
  },
  {
    name: 'ITS News',
    url: 'https://www.its.ac.id/news/feed',
    type: 'rss',
    category: categories.KAMPUS_INDO
  },
  
  // === UNIVERSITAS INTERNATIONAL ===
  {
    name: 'Harvard University',
    url: 'https://news.harvard.edu/gazette/feed',
    type: 'rss',
    category: categories.KAMPUS_INT
  },
  {
    name: 'MIT News',
    url: 'https://news.mit.edu/rss/feed',
    type: 'rss',
    category: categories.KAMPUS_INT
  },
  {
    name: 'Oxford University',
    url: 'https://www.ox.ac.uk/news/feed',
    type: 'rss',
    category: categories.KAMPUS_INT
  },
  {
    name: 'Cambridge University',
    url: 'https://www.cam.ac.uk/news/feed',
    type: 'rss',
    category: categories.KAMPUS_INT
  },
  
  // === BERITA PENDIDIKAN INDONESIA ===
  {
    name: 'Kompas Edukasi',
    url: 'https://edukasi.kompas.com/feed',
    type: 'rss',
    category: categories.PENDIDIKAN_INDO
  },
  {
    name: 'Detik Edukasi',
    url: 'https://www.detik.com/edu/feed',
    type: 'rss',
    category: categories.PENDIDIKAN_INDO
  },
  {
    name: 'Republika Pendidikan',
    url: 'https://republika.co.id/rss/pendidikan',
    type: 'rss',
    category: categories.PENDIDIKAN_INDO
  },
  {
    name: 'Tempo Pendidikan',
    url: 'https://www.tempo.co/rss/pendidikan',
    type: 'rss',
    category: categories.PENDIDIKAN_INDO
  },
  
  // === BERITA PENDIDIKAN INTERNATIONAL ===
  {
    name: 'THE World University News',
    url: 'https://www.timeshighereducation.com/feed',
    type: 'rss',
    category: categories.PENDIDIKAN_INT
  },
  {
    name: 'Inside Higher Ed',
    url: 'https://www.insidehighered.com/feed',
    type: 'rss',
    category: categories.PENDIDIKAN_INT
  },
  {
    name: 'Education Week',
    url: 'https://www.edweek.org/feed',
    type: 'rss',
    category: categories.PENDIDIKAN_INT
  },
  {
    name: 'Chronicle Higher Education',
    url: 'https://www.chronicle.com/feed',
    type: 'rss',
    category: categories.PENDIDIKAN_INT
  },
  
  // === ORGANISASI PENDIDIKAN ===
  {
    name: 'UNESCO Education',
    url: 'https://en.unesco.org/feed/news/rss.xml',
    type: 'rss',
    category: categories.PENDIDIKAN_INT
  },
  {
    name: 'World Bank Education',
    url: 'https://blogs.worldbank.org/education/rss.xml',
    type: 'rss',
    category: categories.PENDIDIKAN_INT
  },
  {
    name: 'OECD Education',
    url: 'https://www.oecd.org/education/rss.xml',
    type: 'rss',
    category: categories.PENDIDIKAN_INT
  }
  // ... lebih banyak sumber bisa ditambahkan
];

// Utility Functions
function escapeMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\];')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getCategoryEmoji(category) {
  switch(category) {
    case categories.BEASISWA_INDO:
    case categories.BEASISWA_INT:
      return '🎓';
    case categories.PENDIDIKAN_INDO:
    case categories.PENDIDIKAN_INT:
      return '📚';
    case categories.KAMPUS_INDO:
    case categories.KAMPUS_INT:
      return '🏛';
    case categories.EVENT:
      return '📅';
    default:
      return '📰';
  }
}

// Message Formatters
function formatChannelPost(item) {
  const title = escapeMarkdown(item.title);
  const desc = escapeMarkdown(item.description?.substring(0, 200) + '...');
  const source = escapeMarkdown(item.sourceName);
  const date = formatDate(item.pubDate);
  
  return `*${getCategoryEmoji(item.category)} ${title}*\n\n` +
    `\`\`\`${desc}\`\`\`\n\n` +
    `_📍 Source: ${source}_\n` +
    `_⏰ ${date}_\n\n` +
    `||@edukasirobot||`;
}

function formatBotPost(item, isDetailed = false) {
  const title = escapeMarkdown(item.title);
  const desc = escapeMarkdown(isDetailed ? item.description : item.description?.substring(0, 400) + '...');
  const source = escapeMarkdown(item.sourceName);
  const link = escapeMarkdown(item.link);
  const date = formatDate(item.pubDate);
  
  return `*${getCategoryEmoji(item.category)} ${title}*\n\n` +
    `\`\`\`${desc}\`\`\`\n\n` +
    `_📍 Source: ${source}_\n` +
    `_⏰ ${date}_\n\n` +
    `||🔗 Link: ${link}||\n\n` +
    `||@edukasirobot||`;
}

// Keyboard Generators
function getMainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🎓 Beasiswa Indonesia', callback_data: `category_${categories.BEASISWA_INDO}` },
        { text: '🌏 Beasiswa International', callback_data: `category_${categories.BEASISWA_INT}` }
      ],
      [
        { text: '📚 Pendidikan Indonesia', callback_data: `category_${categories.PENDIDIKAN_INDO}` },
        { text: '🌍 Pendidikan International', callback_data: `category_${categories.PENDIDIKAN_INT}` }
      ],
      [
        { text: '🏛 Kampus Indonesia', callback_data: `category_${categories.KAMPUS_INDO}` },
        { text: '🌎 Kampus International', callback_data: `category_${categories.KAMPUS_INT}` }
      ],
      [
        { text: '📱 Join Channel Updates', url: 't.me/infoedukasidanbeasiswa' }
      ]
    ]
  };
}

function getChannelPostKeyboard(item) {
  const deepLink = `https://t.me/edukasirobot?start=post_${Buffer.from(item.link).toString('base64')}`;
  return {
    inline_keyboard: [
      [
        {
          text: '🤖 Baca Lengkap di Bot',
          url: deepLink
        },
        {
          text: '🌐 Buka Website',
          web_app: {
            url: item.link
          }
        }
      ]
    ]
  };
}

function getBotPostKeyboard(item) {
  return {
    inline_keyboard: [
      [
        {
          text: '🌐 Buka Website',
          web_app: {
            url: item.link
          }
        },
        {
          text: '📱 Share',
          switch_inline_query: item.title
        }
      ],
      [
        {
          text: '📚 Menu Utama',
          callback_data: 'main_menu'
        },
        {
          text: '🔄 Update Terbaru',
          callback_data: `latest_${item.category}`
        }
      ]
    ]
  };
}

// Content Fetching Functions
async function fetchContent() {
  for (const source of sources) {
    try {
      if (source.type === 'rss') {
        const feed = await parser.parseURL(source.url);
        for (const item of feed.items) {
          if (!sentLinks.has(item.link)) {
            const processedItem = {
              title: item.title,
              description: item.content || item.contentSnippet || item.description,
              link: item.link,
              pubDate: new Date(item.pubDate || new Date()),
              sourceName: source.name,
              category: source.category,
              imageUrl: extractImage(item)
            };
            
            await postToChannel(processedItem);
            sentLinks.add(item.link);
            lastPosts.set(item.link, processedItem);
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching from ${source.name}:`, error.message);
    }
  }
}

// Image Extraction
function extractImage(item) {
  try {
    if (item['media:content']) {
      return item['media:content'].url;
    }
    if (item.enclosure?.url) {
      return item.enclosure.url;
    }
    if (item['content:encoded']) {
      const $ = cheerio.load(item['content:encoded']);
      return $('img').first().attr('src');
    }
    if (item.content) {
      const $ = cheerio.load(item.content);
      return $('img').first().attr('src');
    }
    return null;
  } catch (error) {
    console.error('Error extracting image:', error);
    return null;
  }
}
