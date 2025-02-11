const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');

// Simpan data tugas
const tasksFile = path.join(__dirname, 'tasks.json');
let tasks = {};

// Load existing tasks
if (fs.existsSync(tasksFile)) {
    tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
}

// Expanded slang responses
const slangResponses = {
    noTasks: [
        'anjay kek sultan lu hari ini, ga ada tugas sama sekali 👑',
        'misi bang sultan, ga ada tugas nih boss 🔥',
        'tumben otak lu nyala, ga ada tugas hari ini 🧠',
        'rank mythic emang ada, tapi tugas ga ada boss 🎮',
        'berasa jadi sultan arab ya? tugas nol besar 🕌',
        'yey tugas kosong',
        'akhirnya ga ada tugas hari ini 🎮',
        'bisa main epep sepuasnya nih, tugas nol soalnya 🎯',
        'SAVAGE! M4 GLORY! eh tapi santuy ga ada tugas 📱',
        'santuy kek di pantai, ga ada tugas ni~ 🏖️',
        'asikk bisa scroll tiktok ampe malem nih 📱',
        'gasken mabar tugas free njir 🎮',
        'tumben bet lu, biasa mah bengong aja kek sapi unta 🐄',
        'MANIAC!! eh sorry kebawa maen ML, btw ga ada tugas nih 🎮',
        'aman y, bisa galau sepuasnya hari ini 💔',
        'jomblo ya? santuy ga ada tugas kok 💘',
        'scroll ig sampe jempol keriting gpp, ga ada tugas 📱',
        'wifi lancar? ga ada tugas tuh 📶, nonton ini yu bareng aw',
        'gas mabar ml ga nih? tugas kosong melompong 🎮'
    ],
    taskDeleted: [
        'wihhh pinter juga lu udah kelar satu, TAPI MASIH ADA {count} TUGAS GOBLOK! 🤬',
        'cie udah kelar satu~ TAPI MASIH BANYAK YANG BELOM LU KERJAIN BEGO! 😤',
        'alhamdulillah ya udah kelar satu, SEKARANG KERJAIN {count} LAGI YANG LAEN! 🙏',
        'mantep lah udah kelar satu, TAPI JANGAN PUSH RANK DULU DEK! masih ada {count}! 🎮',
        'SAVAGE! eh salah, baru kelar satu doang. masih ada {count} tugas noh! 🎯',
        'pantes dari tadi scroll ig mulu, udah kelar satu ya? SISA {count} TOLOL! 📱',
        'bagus deh udah kelar satu, SEKARANG TUTUP TU MACEM" SOSMED! kerjain yang laen! 💻',
        'GG BET DAH LU! tapi inget masih ada {count} tugas nganggur! 🎮',
        'lu kira kelar satu bisa langsung mabar? KERJAIN DULU {count} LAGI! 😤',
        'NICE LAH! tapi jangan bucin dulu, masih ada {count} tugas noh! 💘'
    ],
    taskList: [
        'WOI TOLOL! lu masih punya {count} tugas belom kelar nih:\n\n{tasks}\n\nLANGSUNG KERJAIN APA MESTI GUA SPAM TIAP JAM HAH?! 🤬',
        'blok, liat ada {count} tugas masih numpuk nih:\n\n{tasks}\n\nmasih sempet-sempetnya push rank lu ya?! 🎮',
        'BUSET DAH! {count} tugas masih ada nih:\n\n{tasks}\n\nmalah scroll tiktok ampe jempol keriting lu! 📱',
        'adoh masih ada {count} tugas noh:\n\n{tasks}\n\ntu hp panas gara" main ML mulu tau ga?! 🔥',
        'lu gimana si? masih ada {count} tugas masih gantung nih:\n\n{tasks}\n\nLU KIRA DOSEN BISA DI MENTAL KAYA MAIN EPEP?! 💀',
        'cape gua, msi {count} tugas masih ada:\n\n{tasks}\n\nMAU SAMPE KAPAN JADI BEBAN ORTU LU HAH?! 😤',
        'MAMPUS! {count} tugas numpuk nih:\n\n{tasks}\n\nBISA GA SIH SEHARI AJA GA BUCIN?! ❤️',
        'INNALILLAHI! {count} tugas masih ada:\n\n{tasks}\n\nSKIP AJA KULIAH SEKALIAN SONO! 🎓',
        'tu {count} tugas belom kelar:\n\n{tasks}\n\nMAU JADI APA LU BESOK HAH?! 😫',
        'NIH YA! {count} tugas masih ada:\n\n{tasks}\n\nLU KIRA HIDUP CUMA BUAT MAIN GAME?! 🎮'
    ],
    overdue: [
        'MAMPUS LU MAMPUS! tugas "{task}" udah lewat {days} hari! MASIH SEMPET-SEMPETNYA MABAR ML?! OTAK LU DIMANA SIH?! 🤬',
        'BANGKE! tugas "{task}" telat {days} hari! MASIH ASIK SCROLL TIKTOK LU YA?! MINTA DITABOK NIH KAYANYA! 💀',
        'TOLOL! "{task}" udah telat {days} hari! MYTHIC GLORY SIH UDAH DAPET YA, TAPI TUGAS BELOM KELAR GOBLOK! 🎮',
        'BEGO BEGO BEGO! "{task}" telat {days} hari! MAU SAMPE KAPAN JADI BEBAN ORTU?! KERJAIN SEKARANG! 😤',
        'YAELAH! "{task}" telat {days} hari! TU HP BISA GA SIH DIPAKE BUAT NGERJAIN TUGAS SEKALI AJA?! 📱',
        'YA ALLAH! "{task}" telat {days} hari! PUSH RANK TERUS LU YA?! PRESTASI APA YANG MAU LU DAPET HEH?! 🎯',
        'woi blok "{task}" telat {days} hari! BUCIN MULU SIH LU, NIH MAKAN TUH BUCIN! 💔',
        'INNALILLAHI! "{task}" udah telat {days} hari! MASIH SEMPET-SEMPETNYA GALAU YA?! TUGAS TUH DIKERJAIN! 😫',
        'BUJUG! "{task}" telat {days} hari! LU KIRA DOSEN BAKAL PERCAYA ALESAN "LAG" APA?! 🎮',
        'MAMPUS! "{task}" telat {days} hari! PANTES SCROLL IG MULU, TUGAS AJA BELOM KELAR! 📱'
    ],
    reminder: [
        'WOI! TUTUP DULU TU ML! ada tugas nih: ',
        'STOP SCROLL TIKTOK! ni liat tugas lu: ',
        'masih main epep aja lu? nih tugas: ',
        'rank mythic dapet, tapi tugas belom: ',
        'main game mulu lu ya? nih liat: ',
        'masih bucin aja lu? KERJAIN NIH: ',
        'TU HP BISA GOSONG MAEN ML MULU! nih tugas: ',
        'scroll ig ampe jempol keriting ya? NIH: ',
        'galau mulu elah, mending kerjain: ',
        'gua kalo jadi lu si ogah, udah males, tugas masih banyak gini : ',
        'cape gua sama lu masih aja belom ngerjain: ',
        'scrool tiktok mulu, tugas kapan: ',
        'chat doi mulu, KERJAIN DULU NIH: ',
        'tiktok mulu di scrool anyink, tugas ni ada: ',
        'pen sukses tapi gini aja males, heran bet gua, tu tugas lu : ',
        'tu kuota abis gara" maen game mulu! nih: ',
        'SOLO RANKED MASTER YA?! SOLO TUGAS SONO: ',
        'sok galau anjir, kerjain tol : ',
        'syng kerjain tugas dulu dong : ',
        'pilih ngerjain tugas apa aku cium? , tugas lu : ',
        'tugas tugas tugas ni : ',
        'masih nyari konten anime ya? KERJAIN: ',
        'stalking orang mulu! NIH KERJAIN: ',
        'PUSH RANK AMPE PAGI YA?! NIH: ',
        'woi ajg, KERJAIN: '
    ],
    deadlineClose: [
        'GOBLOK GOBLOK GOBLOK! BESOK DEADLINE: ',
        'CLOSE ML SEKARANG! BESOK DEADLINE: ',
        'MAMPUS LU MAMPUS! BESOK KUMPULIN: ',
        'MASIH SEMPET PUSH RANK?! BESOK DEADLINE: ',
        'WAR DEADLINE BESOK NIH: ',
        'BESOK DEADLINE: ',
        'udah cupu, tugas nih kerjain njir bsk deadline : ',
        'MASIH SCROLL TIKTOK?! BESOK DEADLINE: ',
        'CHAT DOI BISA NTAR! BESOK DEADLINE: ',
        'BUCIN MULU LU! BESOK DEADLINE NIH: ',
        'hadeh, besok deadline cok : ',
        'TU JEMPOL KERITING KEBANYAKAN SCROLL! DEADLINE: ',
        'BUSET DAH! BESOK DEADLINE NIH TOLOL: ',
        'MASIH GALAU AJA LU?! BESOK DEADLINE: ',
        'LU MAU JADI APA SIH?! BESOK DEADLINE: '
    ],
    taskAdded: [
        'oke bestie, bakal gua spam sampe lu muak 📱',
        'siap! gua ingetin tiap detik kalo perlu 🕒',
        'gas! siap-siap hp lu geter mulu ya 📳',
        'aman bosqu! bakal gua terror sampe kelar 🔥',
        'NOTED! spam alert incoming~ 📨',
        'sip lah! gua ingetin sampe lu stress 🤯',
        'SIAP 86! spam alert: ON 🚨',
        'oke sayang~ spam incoming! 💕',
        'oke lek, spam mode: activated 🤖',
        'mantep! spam alert goes brrr~ 📢'
    ]
};

// Chat response patterns with regex
const chatPatterns = [
    {
        pattern: /^(bacot|bct|berisik|diem|diam|bising|cerewet|bawel)/i,
        responses: [
            'LU YANG BACOT! {count} tugas masih nganggur bego!',
            'DIEM LU ANJIR! {count} tugas masih gantung malah bacot!',
            'dih, KERJAIN DULU {count} TUGAS LU!',
            'GUA SPAM SAMPE LU STRESS NIH! {count} TUGAS MASIH ADA!',
            'BACOT? KERJAIN DULU NOH {count} TUGAS TOLOL!'
        ]
    },
    {
        pattern: /(cape|capek|lelah|males|malas|bosen|bosan)/i,
        responses: [
            'CAPE MAIN ML SEMALEMAN SIH IYA!',
            'MAEN GAME KUAT, TUGAS DIKIT DOANG MALES!',
            'CAPE APAAN ANJIR?! SCROLL TIKTOK AJA KUAT!',
            'BOSEN? MAIN GAME BISA 24 JAM NON-STOP!',
            'MALES? PUSH RANK AJA BISA SAMPE SUBUH!'
        ]
    },
    {
        pattern: /(laper|makan|maksi|sarapan|mam)/i,
        responses: [
            'LAPER? TUGAS BELOM KELAR UDAH LAPER AJA!',
            'MAKAN MULU! TUGAS KAPAN DILADENIN?!',
            'MAKAN? TUGAS AJA BELOM LU KASIH MAKAN!',
            'MAKAN TERUS LU YA! TUGAS DICUEKIN!',
            'SARAPAN BOLEH, TAPI TUGAS JANGAN DILUPAIN TOLOL!'
        ]
    },
    {
        pattern: /(game|main|mabar|ml|epep|pubg)/i,
        responses: [
            'MAIN GAME JAGO! TUGAS NOL BESAR!',
            'MYTHIC GLORY DAPAT, TUGAS GABISA DAPAT!',
            'MABAR? MABA KERJAIN TUGAS SONO!',
            'MVP PUSH RANK! TUGAS MASIH AFK!',
            'SOLO RANKED MASTER YA?! SOLO TUGAS SONO!'
        ]
    },
    {
        pattern: /(ig|tiktok|sosmed|youtube|yt)/i,
        responses: [
            'SCROLL AMPE JEMPOL KERITING YA LU?!',
            'TIKTOK MULU! TUGAS KAPAN?!',
            'YOUTUBE? TUTORIAL NGERJAIN TUGAS NOH!',
            'KONTEN TERUS! TUGAS KAPAN DIPOSTING?!',
            'REELS MULU! TUGAS DIANGGURIN!'
        ]
    }
    {
        pattern: /(bucin|pacar|doi|sayang|beb|baby)/i,
        responses: [
            'BUCIN MULU! MASA DEPAN GIMANA?!',
            'DOI LU BAKAL NINGGALIN KALO TAU LU MALES!',
            'PACAR BISA DIGANTI! TUGAS GA BISA DIGANTI!',
            'CHAT DOI BISA NTAR! TUGAS DEADLINE BENTAR!',
            'NAJIS BUCIN! KERJAIN TUGAS SONO!'
        ]
    }
];

// Random response picker
const getRandomResponse = (type, data = {}) => {
    const responses = slangResponses[type];
    let response = responses[Math.floor(Math.random() * responses.length)];
    
    // Replace placeholders if any
    if (data.count !== undefined) response = response.replace('{count}', data.count);
    if (data.tasks !== undefined) response = response.replace('{tasks}', data.tasks);
    if (data.task !== undefined) response = response.replace('{task}', data.task);
    if (data.days !== undefined) response = response.replace('{days}', data.days);
    
    return response;
};

// Get task list formatted string
function getFormattedTaskList(userTasks) {
    return Object.entries(userTasks)
        .filter(([key]) => key !== 'currentStep' && key !== 'taskDesc')
        .map(([_, task], index) => `${index + 1}. ${task.desc} (Deadline: ${task.deadline})`)
        .join('\n');
}

// Get task by index
function getTaskByIndex(userTasks, index) {
    const tasks = Object.entries(userTasks)
        .filter(([key]) => key !== 'currentStep' && key !== 'taskDesc');
    return tasks[index - 1]; // index is 1-based for users
}

// Check if task is overdue
function isOverdue(deadline) {
    const today = new Date();
    const deadlineDate = new Date(deadline);
    return deadlineDate < today;
}

// Get days overdue
function getDaysOverdue(deadline) {
    const today = new Date();
    const deadlineDate = new Date(deadline);
    const diffTime = Math.abs(today - deadlineDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    // Handle reconnect
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            
            if (shouldReconnect) {
                await connectToWhatsApp();
            }
        }
    });

    // Credentials update
    sock.ev.on('creds.update', saveCreds);

    // Message handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;
        
        const sender = msg.key.remoteJid;
        const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        
        // Command handler
        if (messageText.startsWith('.')) {
            const [command, ...args] = messageText.slice(1).split(' ');
            
            switch (command) {
                case 'tugas':
                    if (!tasks[sender]) {
                        tasks[sender] = { currentStep: 'waitingForDeadline', taskDesc: args.join(' ') };
                        await sock.sendMessage(sender, { text: 'kapan deadline nya bestie? (format: DD/MM/YYYY)' });
                    }
                    break;

                case 'listtugas':
                    if (!tasks[sender] || Object.keys(tasks[sender]).length <= 2) {
                        await sock.sendMessage(sender, { 
                            text: getRandomResponse('noTasks')
                        });
                    } else {
                        const taskList = getFormattedTaskList(tasks[sender]);
                        const taskCount = Object.keys(tasks[sender]).length - 2;
                        await sock.sendMessage(sender, { 
                            text: getRandomResponse('taskList', { count: taskCount, tasks: taskList })
                        });
                    }
                    break;

                case 'delete':
                    const index = parseInt(args[0]);
                    if (tasks[sender] && !isNaN(index)) {
                        const task = getTaskByIndex(tasks[sender], index);
                        if (task) {
                            delete tasks[sender][task[0]]; // task[0] is the key
                            const remainingTasks = Object.keys(tasks[sender]).length - 2;
                            await sock.sendMessage(sender, { 
                                text: getRandomResponse('taskDeleted', { count: remainingTasks })
                            });
                            saveTasks();
                        }
                    }
                    break;

                case 'clear':
                    if (tasks[sender]) {
                        const taskCount = Object.keys(tasks[sender]).filter(k => k !== 'currentStep' && k !== 'taskDesc').length;
                        if (taskCount > 0) {
                            // Reset tasks for this user
                            tasks[sender] = {};
                            await sock.sendMessage(sender, { 
                                text: [
                                    'MASYAALLAH TABARAKALLAH! 🌟',
                                    'akhirnya lu kelarin semua tugas juga bestie! 🔥',
                                    'semoga ga php ya udah beres semua~ 😏',
                                    'btw kalo boong dosa loh! 🤭',
                                    'aman lah ya, gas mabar! 🎮'
                                ].join('\n')
                            });
                            saveTasks();
                        } else {
                            await sock.sendMessage(sender, {
                                text: 'lah memang ga ada tugas bestie~ santuy aja scroll tiktok 📱'
                            });
                        }
                    }
                    break;
            }
        } else if (tasks[sender]?.currentStep === 'waitingForDeadline') {
            const deadline = messageText.trim();
            const taskDesc = tasks[sender].taskDesc;
            
            if (!tasks[sender][taskDesc]) {
                tasks[sender][taskDesc] = {
                    desc: taskDesc,
                    deadline: deadline
                };
            }
            
            delete tasks[sender].currentStep;
            delete tasks[sender].taskDesc;
            
            await sock.sendMessage(sender, { 
                text: getRandomResponse('taskAdded')
            });
            
            saveTasks();
        } else {
            // Handle pattern-based responses
            const lowerMsg = messageText.toLowerCase();
            
            for (const pattern of chatPatterns) {
                if (pattern.pattern.test(lowerMsg)) {
                    const taskCount = tasks[sender] ? 
                        Object.keys(tasks[sender]).filter(k => k !== 'currentStep' && k !== 'taskDesc').length : 
                        0;
                    
                    const response = pattern.responses[Math.floor(Math.random() * pattern.responses.length)]
                        .replace('{count}', taskCount);
                    
                    await sock.sendMessage(sender, { text: response });
                    break;
                }
            }
        }
    });

    // Schedule very frequent reminders (every 30 minutes from 6 AM to 11 PM)
    schedule.scheduleJob('*/30 6-23 * * *', async () => {
        for (const [sender, userTasks] of Object.entries(tasks)) {
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Check for overdue tasks first
            for (const [desc, task] of Object.entries(userTasks)) {
                if (desc === 'currentStep' || desc === 'taskDesc') continue;

                const deadline = new Date(task.deadline);
                
                if (isOverdue(deadline)) {
                    const daysOverdue = getDaysOverdue(deadline);
                    await sock.sendMessage(sender, { 
                        text: getRandomResponse('overdue', { task: task.desc, days: daysOverdue })
                    });
                } else if (deadline.toDateString() === tomorrow.toDateString()) {
                    await sock.sendMessage(sender, { 
                        text: getRandomResponse('deadlineClose') + task.desc
                    });
                } else if (deadline > today) {
                    await sock.sendMessage(sender, { 
                        text: getRandomResponse('reminder') + task.desc
                    });
                }
            }

            // Random extra reminders (40% chance)
            if (Math.random() < 0.4) {
                for (const [desc, task] of Object.entries(userTasks)) {
                    if (desc === 'currentStep' || desc === 'taskDesc') continue;

                    const deadline = new Date(task.deadline);
                    if (deadline > today) {
                        await sock.sendMessage(sender, { 
                            text: getRandomResponse('reminder') + task.desc
                        });
                    }
                }
            }

            // If no tasks, random encouragement (25% chance)
            if (Object.keys(userTasks).length <= 2 && Math.random() < 0.25) {
                await sock.sendMessage(sender, { 
                    text: getRandomResponse('noTasks')
                });
            }
        }
    });
}

// Save tasks to file
function saveTasks() {
    fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));
}

// Start the bot
connectToWhatsApp();
