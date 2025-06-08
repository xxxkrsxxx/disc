// Load environment variables
require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Collection,
    REST,
    Routes,
    SlashCommandBuilder,
    ChannelType,
    PermissionsBitField,
    OverwriteType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    UserSelectMenuBuilder,
    ComponentType, // Ważne dla paginacji
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const consola = require('consola');
const schedule = require('node-schedule');

// --- ENV VALIDATION ---
const {
    DISCORD_TOKEN,
    CLIENT_ID,
    OWNER_ID,
    CHANNEL_ID, // Kanał dla ankiet
    ROLE_ID,       // Rola pingowana przy ankietach
    GUILD_ID,      // Kluczowe dla działania na jednym serwerze
    LEADER_ROLE_ID,
    LOBBY_MASTER_ROLE_ID,
    PANEL_CHANNEL_ID,
    QUEUE_CHANNEL_ID,
    GAME_LOBBY_VOICE_CHANNEL_ID,
    WAITING_ROOM_VOICE_CHANNEL_ID,
    VOICE_CREATOR_CHANNEL_ID,
    TEMP_CHANNEL_CATEGORY_ID,
    MVP_ROLE_ID,
    TEMP_VC_CONTROL_PANEL_CATEGORY_ID,
    MONITORED_VC_ID,
    LOG_TEXT_CHANNEL_ID,
    WELCOME_DM_VC_ID,
    DEFAULT_POLL_CHANNEL_ID,
    DEFAULT_PANEL_CHANNEL_ID,
    DEFAULT_QUEUE_CHANNEL_ID,
    WEEKLY_MVP_CHANNEL_ID,
    POLL_PARTICIPANTS_LOG_CHANNEL_ID
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !OWNER_ID || !GUILD_ID || !LEADER_ROLE_ID ) {
    consola.error('❌ Critical ENV variables (TOKEN, CLIENT_ID, OWNER_ID, GUILD_ID, LEADER_ROLE_ID) are missing!');
    process.exit(1);
}
function checkEnvVar(varName, value, featureName, isCritical = false) {
    if (!value) {
        const message = `ENV variable ${varName} is missing, ${featureName} feature might be affected or disabled.`;
        if (isCritical) {
            consola.error(`❌ CRITICAL: ${message}`);
        } else {
            consola.warn(`⚠️ ${message}`);
        }
        return false;
    }
    return true;
}
checkEnvVar('CHANNEL_ID', CHANNEL_ID || DEFAULT_POLL_CHANNEL_ID, 'Polls (scheduled/test command)', true);
checkEnvVar('ROLE_ID', ROLE_ID, 'Poll pings');
checkEnvVar('LOBBY_MASTER_ROLE_ID', LOBBY_MASTER_ROLE_ID, 'Lobby Master role (for queue management)');
checkEnvVar('PANEL_CHANNEL_ID', PANEL_CHANNEL_ID || DEFAULT_PANEL_CHANNEL_ID, 'Ranking panel display');
checkEnvVar('QUEUE_CHANNEL_ID', QUEUE_CHANNEL_ID || DEFAULT_QUEUE_CHANNEL_ID, 'Queue system');
checkEnvVar('GAME_LOBBY_VOICE_CHANNEL_ID', GAME_LOBBY_VOICE_CHANNEL_ID, 'Lobby protection & /ktosus command');
checkEnvVar('WAITING_ROOM_VOICE_CHANNEL_ID', WAITING_ROOM_VOICE_CHANNEL_ID, 'Lobby protection redirect');
checkEnvVar('VOICE_CREATOR_CHANNEL_ID', VOICE_CREATOR_CHANNEL_ID, 'Temporary voice channel creation');
checkEnvVar('TEMP_CHANNEL_CATEGORY_ID', TEMP_CHANNEL_CATEGORY_ID, 'Temporary voice channel categorization');
checkEnvVar('MVP_ROLE_ID', MVP_ROLE_ID, 'MVP award feature');
checkEnvVar('TEMP_VC_CONTROL_PANEL_CATEGORY_ID', TEMP_VC_CONTROL_PANEL_CATEGORY_ID, 'Temporary VC control panel creation');
checkEnvVar('MONITORED_VC_ID', MONITORED_VC_ID, 'Voice join/leave logging for a specific channel');
checkEnvVar('LOG_TEXT_CHANNEL_ID', LOG_TEXT_CHANNEL_ID, 'Voice join/leave logging channel');
checkEnvVar('WELCOME_DM_VC_ID', WELCOME_DM_VC_ID, 'Welcome DM on VC join feature');
checkEnvVar('WEEKLY_MVP_CHANNEL_ID', WEEKLY_MVP_CHANNEL_ID, 'Weekly MVP Announcement Channel (optional, defaults to PANEL_CHANNEL_ID or DEFAULT_PANEL_CHANNEL_ID if not set)');
checkEnvVar('POLL_PARTICIPANTS_LOG_CHANNEL_ID', POLL_PARTICIPANTS_LOG_CHANNEL_ID, 'Poll Participants Log Channel (optional)');


// --- DATA DIRECTORY SETUP ---
const DATA_DIR = process.env.RENDER_DISK_MOUNT_PATH || path.join(__dirname, 'bot_data');
console.log(`[INIT] Data directory is set to: ${DATA_DIR}`);

if (!fs.existsSync(DATA_DIR)){
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        consola.info(`Created data directory at: ${DATA_DIR}`);
    } catch (err) {
        consola.error(`Failed to create data directory at ${DATA_DIR}:`, err);
        process.exit(1);
    }
}

// --- FILE HELPERS ---
const ANKIETA_IMG_URL = 'https://i.imgur.com/8G1Dmkf.jpeg';
const RANKING_IMG_URL = 'https://i.imgur.com/rF0YAFC.png';
const MVP_WEEKLY_RANKING_IMG_URL = 'https://i.imgur.com/9Unne8r.png';

const POLL_BONUS_STATUS_FILE = path.join(DATA_DIR, 'pollBonusStatus.json');
const WYNIK_RANK_FILE = path.join(DATA_DIR, 'wynikRank.json');
const PANEL_ID_FILE = path.join(DATA_DIR, 'panel_message_id.txt');
const QUEUE_MESSAGE_ID_FILE = path.join(DATA_DIR, 'queue_message_id.txt');
const FACTION_STATS_FILE = path.join(DATA_DIR, 'factionStats.json');
const WELCOME_DM_SENT_USERS_FILE = path.join(DATA_DIR, 'welcomeDmSentUsers.json');
const KTOSUS_COOLDOWNS_FILE = path.join(DATA_DIR, 'ktosusCooldowns.json');

function loadJSON(filePath, defaultValue = {}) {
    if (!fs.existsSync(filePath)) {
        try {
            fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
            return defaultValue;
        } catch (err) {
            consola.error(`Failed to write initial JSON to ${filePath}:`, err);
            return defaultValue;
        }
    }
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        if (fileContent.trim() === '') {
            fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
            return defaultValue;
        }
        return JSON.parse(fileContent);
    } catch (error) {
        consola.error(`Error parsing JSON from ${filePath}:`, error);
        try {
            fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
        } catch (writeErr) {
            consola.error(`Failed to write default JSON to ${filePath} after parse error:`, writeErr);
        }
        return defaultValue;
    }
}
function saveJSON(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (err) {
        consola.error(`Failed to save JSON to ${filePath}:`, err);
    }
}

function loadFactionStats() {
    return loadJSON(FACTION_STATS_FILE, { crewmate_wins: 0 });
}
function saveFactionStats(data) {
    saveJSON(FACTION_STATS_FILE, data);
}
function incrementCrewmateWins(count = 1) {
    const stats = loadFactionStats();
    stats.crewmate_wins = (stats.crewmate_wins || 0) + count;
    saveFactionStats(stats);
    consola.info(`[Faction Stats] Crewmate wins incremented. Total: ${stats.crewmate_wins}`);
}

function loadWynikRank() {
    return loadJSON(WYNIK_RANK_FILE, {});
}
function saveWynikRank(data) {
    saveJSON(WYNIK_RANK_FILE, data);
}
function updateWynikRank(userId, pts) {
    const wr = loadWynikRank();
    wr[userId] = (wr[userId] || 0) + pts;
    if (wr[userId] < 0) {
        wr[userId] = 0;
    }
    saveWynikRank(wr);
    consola.info(`[Points System] Updated score for ${userId} by ${pts}. New score: ${wr[userId]}`);
}

function getSortedRanking() {
    const wr = loadWynikRank();
    return Object.entries(wr).sort(([, aPoints], [, bPoints]) => bPoints - aPoints);
}


function addPollPoints(userId) {
    updateWynikRank(userId, 100);
    consola.info(`[Poll Voting] Added 100 points to ${userId} for first vote of the day.`);
}

function resetPollBonusData() {
    saveJSON(POLL_BONUS_STATUS_FILE, {});
    consola.info('💰 Dane statusu bonusu za głosowanie w ankietach (pollBonusStatus.json) zresetowane na nowy dzień.');
}


function savePanelMessageId(id) {
    fs.writeFileSync(PANEL_ID_FILE, id, 'utf8');
}
function loadPanelMessageId() {
    if (fs.existsSync(PANEL_ID_FILE)) {
        return fs.readFileSync(PANEL_ID_FILE, 'utf8');
    }
    return '';
}

function saveQueueMessageId(id) {
    fs.writeFileSync(QUEUE_MESSAGE_ID_FILE, id, 'utf8');
}
function loadQueueMessageId() {
    if (fs.existsSync(QUEUE_MESSAGE_ID_FILE)) {
        return fs.readFileSync(QUEUE_MESSAGE_ID_FILE, 'utf8');
    }
    return '';
}

const POLL_CELEBRATION_GIFS = [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZmh6NWJsczllZmM5cTc2bnRwbGYyeWIzZGxnYXFjbTI3aGNrY25ncCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/l3vRlT2k2L35Cnn5C/giphy.gif',
    'https://media.giphy.com/media/olAik8MhYOB9K/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHI3a21xaThvZ29vZXVkcmx0M2Q3am5mdGowbGsxd3VoaWZrbWhtayZlcD12MV9naWZzX3NlYXJjaCZjdD1n/y0NFayaBeiWEU/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHI3a21xaThvZ29vZXVkcmx0M2Q3am5mdGowbGsxd3VoaWZrbWhtayZlcD12MV9naWZzX3NlYXJjaCZjdD1n/XVR9lp9qUDHmU/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3g0YnRzOTdvajg0YXQxb2xlcTl6aTFqYm9qMmxla2N1d3BlNjJ5eiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/l8TwxjgFRhDASPGuXc/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3g0YnRzOTdvajg0YXQxb2xlcTl6aTFqYm9qMmxla2N1d3BlNjJ5eiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/vFnxro4sFV1R5b95xs/giphy.gif',
    'https://media.giphy.com/media/yAnC4g6sUpX0MDkGOg/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYmM0bHBwYWZnenc5MmRod2pibTJkbHNtbWswM2FvMmU3ODIzNWs1cyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/s2qXK8wAvkHTO/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYmM0bHBwYWZnenc5MmRod2pibTJkbHNtbWswM2FvMmU3ODIzNWs1cyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/l2JJyDYEX1tXFmCd2/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbWZkYWcxczc4eXZ6cGh2djRqMXhlOGVzcjhlbTZhcTE1cGppenEyNSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/lPuW5AlR9AeWzSsIqi/giphy.gif',
    'https://media.giphy.com/media/RE5iREBNhI0Ok/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTNnZzZ6NjhhNDM1a3F3cjd1YWtqbGQ3MHpiNnZoMG1za3Rxb3Y5ciZlcD12MV9naWZzX3NlYXJjaCZjdD1n/mCRJDo24UvJMA/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTNnZzZ6NjhhNDM1a3F3cjd1YWtqbGQ3MHpiNnZoMG1za3Rxb3Y5ciZlcD12MV9naWZzX3NlYXJjaCZjdD1n/1kkxWqT5nvLXupUTwK/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExc2plM25nbjZyZ29odnpyc215cXBpaHBmcHVubXA0cXQwNmV2YWx1OCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/MDJ9IbxxvDUQM/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExc2plM25nbjZyZ29odnpyc215cXBpaHBmcHVubXA0cXQwNmV2YWx1OCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/13CoXDiaCcCoyk/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExeGE2dmN2aHlpNTljMzdnaXVzdzA1cDZmMHlqbWJnbm9jYjFyczVzcCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/rcRwO8GMSfNV6/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExeGE2dmN2aHlpNTljMzdnaXVzdzA1cDZmMHlqbWJnbm9jYjFyczVzcCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/c4t11obaChpu0/giphy.gif',
    'https://media.giphy.com/media/T7YENYx6PtUdO/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcnUxZG5wczZoM3VpNWFnanNkYmRiajN1dG95ZDNyaDJiNWhzc29iNyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/fQZX2aoRC1Tqw/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMjY1ZWF4bTlhbnV0bDNwbHhtdGl6NDlrYnRrMXM1NmJvN2VucTh0ayZlcD12MV9naWZzX3NlYXJjaCZjdD1n/QUmpqPoJ886Iw/giphy.gif'
];

const WINNING_POLL_GIFS = POLL_CELEBRATION_GIFS.filter(gif => gif.endsWith('.gif') || gif.includes('giphy.gif'));
if (WINNING_POLL_GIFS.length === 0) {
    WINNING_POLL_GIFS.push('https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3g0YnRzOTdvajg0YXQxb2xlcTl6aTFqYm9qMmxla2N1d3BlNjJ5eiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/vFnxro4sFV1R5b95xs/giphy.gif');
}

const TIE_POLL_GIF = 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3g0YnRzOTdvajg0YXQxb2xlcTl6aTFqYm9qMmxla2N1d3BlNjJ5eiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/l8TwxjgFRhDASPGuXc/giphy.gif';
const NO_VOTES_GIF = 'https://media.giphy.com/media/yAnC4g6sUpX0MDkGOg/giphy.gif';
const DEFAULT_POLL_GIF = 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3g0YnRzOTdvajg0YXQxb2xlcTl6aTFqYm9qMmxla2N1d3BlNjJ5eiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/vFnxro4sFV1R5b95xs/giphy.gif';

const KTOSUS_COOLDOWN_DURATION = 8 * 60 * 60 * 1000; // ZMIANA: 8 godzin w milisekundach
const KTOSUS_MESSAGES = [
    "To że @nick jest sus, jest tak samo pewne jak to, że Mesdek coś wtrąci, nawet jak nikt nie pytał.",
    "@nick sus? Mesdek jeszcze nie skończył zdania, a już wszystko wie.",
    "@nick był/a ostatnio widziany/a z Natalką… może tylko na spacerze z psem, a może szli dokonać wspólnej zbrodni?",
    "Natalka wyszła z psem, a @nick z ciałem- przypadek?",
    "@nick jest podejrzany/a jak zbyt miłe słowa Zwierzaka.",
    "luki290 świetnie ogarnia mody, a @nick jeszcze lepiej ogarnia… jak się wykręcić z morderstwa.",
    "@nick zachowuje się sus... Czyżby wziął lekcje jesterowania od ma1keda?",
    "@nick podejrzanie milczy. Może Zbyszek daje lekcję przetrwania.",
    "Jeśli @nick jest w parze impo z Pacią to wytrwają wspólnie najwyżej do pierwszego spotkania.",
    "Skip na Hozolu to żart. A @nick zrobił/a to na serio- szczerze? Mega sus!",
    "@nick próbuje zrzucić swoje grzechy na Karo. Raczej nie polecamy tego robić, bo to ona pisała bota od rankingu.",
    "Kilah może gra raz na sto lat, ale @nick zabija w każdej rundzie. Przypadek?",
    "Zwierzak zna mapy z geoguessr, a @nick zna tylko trasy do najbliższego trupa.",
    "Amae jeszcze nie zdążyła wejść na VC, a @nick już zabił pół załogi.",
    "@nick i kabelki? Przecież to jest daltonista! MEGA SUS!",
    "Nawet jeśli @nick nie jest impostorem to i tak ma coś na sumieniu...",
    "@nick jest mega sus. Powód? Brak. Tak jak podczas niektórych głosowań w lobby.",
    "Gdyby Among miał horoskop, @nick był/aby Skorpionem, bo to najbardziej zdradliwy znak zodiaku.",
    "Gdyby słowo SUS miało avatar, wyglądałoby jak @nick.",
    "@nick zachowuje się jakby miał/a rolę killera... Pewnie dlatego, że ją dostał/a.",
    "Zaufanie do @nick? To jak granie w Rosyjską ruletkę na sześć naboi.",
    "W tym świecie są dwie rzeczy pewne: podatki i to, że @nick jest SUS.",
    "Na pytanie „kto jest SUS?” wszechświat szepcze: @nick.",
    "@nick jest tak samo podejrzany/a jak ananas na pizzy (nie zachęcamy do dyskusji na temat pizzy hawajskiej)",
    "@nick nie jest winny/a… tylko dziwnie często się tak jednak składa.",
    "Adamesko znowu krzyczy 'spokój', a @nick właśnie planuje cichy sabotaż.",
    "Kiedy @nick robi coś głupiego, ADM Zerashi już ładuje 'kurwa' z szewską pasją."
];


async function registerCommands() {
    const cmds = [];

    cmds.push(
        new SlashCommandBuilder().setName('reload').setDescription('Przeładuj komendy (Owner).').toJSON()
    );

    cmds.push(
        new SlashCommandBuilder().setName('ankieta').setDescription('Zarządzanie ankietami.')
            .addSubcommand(subcommand =>
                subcommand.setName('start')
                .setDescription('TEST: Ręcznie uruchamia ankietę (admin).')
            )
            .addSubcommand(subcommand =>
                subcommand.setName('zakoncz')
                .setDescription('Zakończ aktualnie trwające głosowanie (admin).')
            )
            .toJSON()
    );

    cmds.push(
        new SlashCommandBuilder().setName('kolejka').setDescription('Zarządzanie kolejką do gry.')
            .addSubcommand(subcommand =>
                subcommand.setName('start')
                .setDescription('Rozpoczyna/resetuje panel kolejki (admin/mistrz lobby).')
            )
            .addSubcommand(subcommand =>
                subcommand.setName('dodaj')
                .setDescription('Dodaje gracza na koniec kolejki (admin/mistrz lobby).')
                .addUserOption(option => option.setName('uzytkownik').setDescription('Gracz do dodania.').setRequired(true))
            )
            .addSubcommand(subcommand =>
                subcommand.setName('pozycja')
                .setDescription('Ustawia gracza na konkretnej pozycji w kolejce (admin/mistrz lobby).')
                .addUserOption(option => option.setName('uzytkownik').setDescription('Gracz, którego pozycję chcesz ustawić.').setRequired(true))
                .addIntegerOption(option => option.setName('wartosc').setDescription('Numer pozycji w kolejce (od 1).').setRequired(true).setMinValue(1))
            )
            .addSubcommand(subcommand =>
                subcommand.setName('pociagnij_gracza')
                .setDescription('Pociąga konkretnego gracza z kolejki (admin/mistrz lobby).')
                .addUserOption(option => option.setName('uzytkownik').setDescription('Gracz do pociągnięcia z kolejki.').setRequired(true))
            )
            .addSubcommand(subcommand =>
                subcommand.setName('wyczysc')
                .setDescription('Czyści całą kolejkę (admin/mistrz lobby).')
            )
            .toJSON()
    );

    cmds.push(
        new SlashCommandBuilder().setName('ranking').setDescription('Zarządzanie rankingiem punktów.')
            .addSubcommand(subcommand =>
                subcommand.setName('dodaj')
                .setDescription('Ręcznie dodaje punkty użytkownikowi (admin).')
                .addUserOption(option => option.setName('uzytkownik').setDescription('Użytkownik, któremu dodać punkty.').setRequired(true))
                .addIntegerOption(option => option.setName('liczba_punktow').setDescription('Liczba punktów do dodania.').setRequired(true).setMinValue(1))
                .addStringOption(option => option.setName('powod').setDescription('Opcjonalny powód przyznania punktów.').setRequired(false))
            )
            .addSubcommand(subcommand =>
                subcommand.setName('usun')
                .setDescription('Odejmuje punkty danemu użytkownikowi (admin).')
                .addUserOption(option => option.setName('uzytkownik').setDescription('Użytkownik, któremu odjąć punkty.').setRequired(true))
                .addIntegerOption(option => option.setName('liczba_punktow').setDescription('Liczba punktów do odjęcia.').setRequired(true).setMinValue(1))
            )
            .addSubcommand(subcommand =>
                subcommand.setName('clear')
                .setDescription('Czyści cały ranking punktów (admin).')
            )
            .addSubcommand(subcommand =>
                subcommand.setName('among')
                .setDescription('Wyświetla pełny, stronicowany ranking wszystkich graczy.')
            )
            .toJSON()
    );

    cmds.push(
        new SlashCommandBuilder()
            .setName('win')
            .setDescription('Rozpocznij proces przyznawania punktów za role po grze (admin).')
            .toJSON()
    );

    cmds.push(
        new SlashCommandBuilder()
            .setName('ktosus')
            .setDescription('Losowo wybiera podejrzaną osobę z lobby gry (admin/mistrz lobby, cooldown 8h).')
            .toJSON()
    );

    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        consola.info(`[Commands] Registering ${cmds.length} application (/) commands.`);
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: cmds }
        );
        consola.success(`✅ Successfully registered application (/) commands in guild ${GUILD_ID}`);
    } catch (error) {
        consola.error(`❌ Failed to register application (/) commands in guild ${GUILD_ID}:`, error);
    }
}

// --- PANEL EMBED & ROW ---
function getPanelEmbed(guild) {
    let rankingDescription = 'Ładowanie rankingu...';
    if (guild) {
        const sortedRanking = getSortedRanking();
        const top10 = sortedRanking.slice(0, 10);
        let currentMvpId = null;

        if (MVP_ROLE_ID) {
            const mvpRole = guild.roles.cache.get(MVP_ROLE_ID);
            if (mvpRole) {
                const mvpMember = guild.members.cache.find(m => m.roles.cache.has(mvpRole.id));
                if (mvpMember) currentMvpId = mvpMember.id;
            }
        }
        
        const sortedDisplay = top10.map(([userId, points], i) => {
            let mvpMarker = '';
            if (userId === currentMvpId) {
                mvpMarker = ' 👑 **MVP Tygodnia!**';
            }
            return `${i + 1}. <@${userId}> – ${points} pkt${mvpMarker}`;
        });
    
        rankingDescription = sortedDisplay.length ? sortedDisplay.join('\n') : 'Brak danych do wyświetlenia.\nZacznijcie grać i zdobywać punkty!';
    }

    return new EmbedBuilder()
        .setTitle('Admin Table Stats')
        .setColor(0xDAA520)
        .setImage(RANKING_IMG_URL)
        .setDescription(rankingDescription);
}

function getPanelRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('show_wynikirank')
            .setLabel('Odśwież Ranking 🏆')
            .setStyle(ButtonStyle.Primary)
    );
}

// --- ANKIETA ---
const susMessagePart = "\n\n💡Ale wiecie, co jest jeszcze bardziej SUS?\n\n🔔Próba wejścia do gry po 19:00 i zdziwienie, że już nie ma miejsca.\n      Gramy i tak od 19:00. Bądź wcześniej i zaklep sobie slota!";

function determineWinnerDescriptionForMainEmbed(votesCollection) {
    const counts = { '19:00': 0, '20:00': 0, '21:00': 0, '22:00': 0 };
    votesCollection.forEach((voteCustomId, userId) => {
        const timeKey = voteCustomId.replace('vote_', '') + ":00";
        if (counts[timeKey] !== undefined) {
            counts[timeKey]++;
        }
    });

    const maxVotes = Math.max(...Object.values(counts));
    let winner = null;
    if (maxVotes > 0) {
        const winners = Object.entries(counts).filter(([, c]) => c === maxVotes).map(([k]) => k);
        winner = winners.length === 1 ? winners[0] : 'tie';
    }

    if (winner && winner !== 'tie') {
        return `Najwięcej psychopatów chce grać o **${winner}**!`;
    } else if (winner === 'tie') {
        return 'Nie udało się wybrać jednej godziny. Mamy remis!';
    } else {
        return 'Nikt nie zagłosował... Smuteczek.';
    }
}

function buildPollEmbeds(currentVotesCollection, isFinal = false) {
    const mainPollTitle = isFinal ? '🔪 Głosowanie Zakończone! 🔪' : '🔪 AMONG WIECZORKIEM? 🔪';
    const mainPollDescription = isFinal ? determineWinnerDescriptionForMainEmbed(currentVotesCollection) : 'O której godzinie wejdziesz pokazać, że to Ty jesteś najlepszym graczem?';

    const mainImageEmbed = new EmbedBuilder()
        .setColor(0x8B0000)
        .setTitle(mainPollTitle)
        .setDescription(mainPollDescription)
        .setImage(ANKIETA_IMG_URL)
        .setFooter({ text: isFinal ? "Głosowanie zamknięte." : 'Wybierz godzinę! Kliknij "Pokaż Głosujących", aby zobaczyć kto na co zagłosował.' });

    const counts = { vote_19: 0, vote_20: 0, vote_21: 0, vote_22: 0 };
    currentVotesCollection.forEach((voteCustomId, userId) => {
        if (counts[voteCustomId] !== undefined) {
            counts[voteCustomId]++;
        }
    });

    const totalVotes = Object.values(counts).reduce((a, b) => a + b, 0);
    const resultsTitle = isFinal ? '📊 Ostateczne Wyniki Głosowania 📊' : '🔔 Aktualne wyniki głosowania';

    const resultsEmbed = new EmbedBuilder()
        .setColor(0xCD5C5C)
        .setTitle(resultsTitle);

    let resultsDescription = "";
    if (totalVotes === 0 && !isFinal) {
        resultsDescription = "Nikt jeszcze nie zagłosował.";
    } else if (totalVotes === 0 && isFinal) {
        resultsDescription = "Brak głosów w tej ankiecie.";
    } else {
        resultsDescription = `19:00 - **${counts.vote_19}** ${counts.vote_19 === 1 ? 'głos' : 'głosów'}\n` +
                                 `20:00 - **${counts.vote_20}** ${counts.vote_20 === 1 ? 'głos' : 'głosów'}\n` +
                                 `21:00 - **${counts.vote_21}** ${counts.vote_21 === 1 ? 'głos' : 'głosów'}\n` +
                                 `22:00 - **${counts.vote_22}** ${counts.vote_22 === 1 ? 'głos' : 'głosów'}`;
    }
    resultsEmbed.setDescription(resultsDescription);

    if (!isFinal) {
        resultsEmbed.setFooter({text: "Wyniki aktualizują się w czasie rzeczywistym"});
    }
    return [mainImageEmbed, resultsEmbed];
}

async function endVoting(message, votesCollection, forceEnd = false) {
    try {
        if (!message) {
            consola.warn("[endVoting] Message object was null.");
            return false;
        }

        const finalPollEmbeds = buildPollEmbeds(votesCollection, true);
        const disabledComponents = message.components[0].components.map(b => ButtonBuilder.from(b).setDisabled(true));
        const disabledRow = new ActionRowBuilder().addComponents(disabledComponents);

        await message.edit({ embeds: finalPollEmbeds, components: [disabledRow] });
        consola.info("[endVoting] Original poll message updated with final results and disabled buttons.");

        const countsByTime = { '19:00': 0, '20:00': 0, '21:00': 0, '22:00': 0 };
        const votersByTime = { '19:00': [], '20:00': [], '21:00': [], '22:00': [] };
        const allVoters = new Set();

        votesCollection.forEach((voteCustomId, userId) => {
            allVoters.add(userId);
            const timeKey = voteCustomId.replace('vote_', '') + ":00";
            if (countsByTime[timeKey] !== undefined) {
                countsByTime[timeKey]++;
                votersByTime[timeKey].push(`<@${userId}>`);
            }
        });

        const maxVotes = Math.max(...Object.values(countsByTime));
        let winnerTime = null;

        if (maxVotes > 0) {
            const winningTimes = Object.entries(countsByTime)
                .filter(([, count]) => count === maxVotes)
                .map(([time]) => time);
            if (winningTimes.length === 1) {
                winnerTime = winningTimes[0];
            } else {
                winnerTime = 'tie';
            }
        }

        const summaryEmbed = new EmbedBuilder().setColor(0x2ECC71);
        let gifUrl;
        let summaryTitle = '🎉 Głosowanie Zakończone! 🎉';
        let summaryDescription = '';

        if (winnerTime && winnerTime !== 'tie') {
            summaryTitle = `🎉🎉🎉 Godzina ${winnerTime} Wygrywa! 🎉🎉🎉`;
            if (WINNING_POLL_GIFS.length > 0) {
                gifUrl = WINNING_POLL_GIFS[Math.floor(Math.random() * WINNING_POLL_GIFS.length)];
            } else {
                gifUrl = DEFAULT_POLL_GIF;
            }

            if (winnerTime === '19:00') {
                summaryDescription = "🗳️ Godzina 19:00 wybrana przez Psychopatów!\n\n🧠  Wszyscy wiemy, że to jedyna pora żeby zdążyć zanim zacznie się... coś więcej.\n\n 🕖 Przyjdź punktualnie, bo później czeka Cię kolejka jak w PRL.";
            } else if (['20:00', '21:00', '22:00'].includes(winnerTime)) {
                summaryDescription = `🗳️ Większość z was wyjątkowo zagłosowała na ${winnerTime}.${susMessagePart}`;
            } else {
                summaryDescription = `Wybrano godzinę **${winnerTime}**! Do zobaczenia w grze!`;
            }
            summaryEmbed.setDescription(summaryDescription);

            if (votersByTime[winnerTime] && votersByTime[winnerTime].length > 0) {
                summaryEmbed.addFields({ name: `⏰ Obecni o ${winnerTime}:`, value: votersByTime[winnerTime].join(', ') });
            } else {
                summaryEmbed.addFields({ name: `⏰ Obecni o ${winnerTime}:`, value: 'Nikt nie potwierdził przybycia na tę godzinę.' });
            }
        } else if (winnerTime === 'tie') {
            summaryTitle = `🤝 Mamy Remis! 🤝`;
            gifUrl = TIE_POLL_GIF;
            summaryDescription = 'Nie udało się wybrać jednej godziny. Spróbujcie dogadać się na czacie!';
            summaryEmbed.setDescription(summaryDescription);

            let tieFields = [];
            Object.entries(countsByTime).forEach(([time, count]) => {
                if (count === maxVotes && maxVotes > 0) {
                    tieFields.push({
                        name: `Remis na ${time}: ${count} głosów`,
                        value: votersByTime[time].length > 0 ? votersByTime[time].join(', ') : 'Brak głosujących na tę opcję.',
                        inline: true
                    });
                }
            });
            if (tieFields.length > 0) summaryEmbed.addFields(tieFields);

        } else {
            summaryTitle = '😥 Nikt nie zagłosował... 😥';
            gifUrl = NO_VOTES_GIF || DEFAULT_POLL_GIF;
            summaryDescription = 'Może następnym razem?';
            summaryEmbed.setDescription(summaryDescription);
        }

        summaryEmbed.setTitle(summaryTitle);
        if (gifUrl) {
            summaryEmbed.setImage(gifUrl);
        }


        await message.channel.send({ embeds: [summaryEmbed] });
        consola.info(`[Voting Ended] Results announced. Winner: ${winnerTime || 'No votes / Tie'}`);

        if (POLL_PARTICIPANTS_LOG_CHANNEL_ID && allVoters.size > 0) {
            try {
                const logChannel = await client.channels.fetch(POLL_PARTICIPANTS_LOG_CHANNEL_ID);
                if (logChannel && logChannel.isTextBased()) {
                    const participantsEmbed = new EmbedBuilder()
                        .setTitle(`🗳️ Uczestnicy Ankiety z ${new Date().toLocaleDateString('pl-PL')}`)
                        .setColor(0x7289DA)
                        .setTimestamp();

                    const fields = [];
                    const timeSlots = ['19:00', '20:00', '21:00', '22:00'];
                    const voteCustomIdPrefix = 'vote_';

                    timeSlots.forEach(slot => {
                        const slotKey = voteCustomIdPrefix + slot.substring(0, 2);
                        const votersForSlot = [];
                        votesCollection.forEach((voteId, userId) => {
                            if (voteId === slotKey) {
                                votersForSlot.push(`<@${userId}>`);
                            }
                        });
                        if (votersForSlot.length > 0) {
                            fields.push({ name: `Głosujący na ${slot}:`, value: votersForSlot.join('\n'), inline: true });
                        }
                    });

                    if (fields.length > 0) {
                        const MAX_FIELDS_PER_EMBED = 25;
                        for (let i = 0; i < fields.length; i += MAX_FIELDS_PER_EMBED) {
                            const chunk = fields.slice(i, i + MAX_FIELDS_PER_EMBED);
                            const embedToSend = new EmbedBuilder(participantsEmbed.toJSON());
                            embedToSend.setFields(chunk);
                            await logChannel.send({ embeds: [embedToSend] });
                        }
                    } else {
                        participantsEmbed.setDescription("Brak uczestników w tej ankiecie.");
                        await logChannel.send({ embeds: [participantsEmbed] });
                    }
                    consola.info(`[Poll Participants Log] Sent participants list to channel ID ${POLL_PARTICIPANTS_LOG_CHANNEL_ID}.`);
                } else {
                    consola.warn(`[Poll Participants Log] Channel ID ${POLL_PARTICIPANTS_LOG_CHANNEL_ID} not found or not a text channel.`);
                }
            } catch (logError) {
                consola.error('[Poll Participants Log] Error sending participants list:', logError);
            }
        } else if (allVoters.size === 0 && POLL_PARTICIPANTS_LOG_CHANNEL_ID) {
             try {
                const logChannel = await client.channels.fetch(POLL_PARTICIPANTS_LOG_CHANNEL_ID);
                if (logChannel && logChannel.isTextBased()) {
                    const noParticipantsEmbed = new EmbedBuilder()
                        .setTitle(`🗳️ Uczestnicy Ankiety z ${new Date().toLocaleDateString('pl-PL')}`)
                        .setDescription("Brak uczestników w tej ankiecie.")
                        .setColor(0x7289DA)
                        .setTimestamp();
                    await logChannel.send({ embeds: [noParticipantsEmbed] });
                    consola.info('[Poll Participants Log] No participants in the poll to log. Sent message to log channel.');
                }
            } catch (logError) {
                consola.error('[Poll Participants Log] Error sending no participants message:', logError);
            }
        }


        return true;

    } catch (e) {
        consola.error('Error ending voting:', e);
        if (message.channel && typeof message.channel.send === 'function') {
            try {
                await message.channel.send("Wystąpił błąd podczas kończenia głosowania. Sprawdź logi.");
            } catch (sendError) {
                consola.error("Additionally, failed to send error message to channel:", sendError);
            }
        }
        return false;
    }
}

// --- SEKCJA LOGIKI KOLEJKI ---
let currentQueue = [];
let queueMessage = null;
let lastPulledUserIds = [];
let isLobbyLocked = false;

function isUserAdmin(interactionOrUser, guild) {
    const userId = interactionOrUser.user ? interactionOrUser.user.id : interactionOrUser.id;
    if (userId === OWNER_ID) return true;
    if (!guild) {
        consola.warn("[isUserAdmin] Guild object is undefined for admin check.");
        return false;
    }
    const member = guild.members.cache.get(userId);
    return member && member.roles.cache.has(LEADER_ROLE_ID);
}

function isUserQueueManager(interactionOrUser, guild) {
    if (isUserAdmin(interactionOrUser, guild)) return true;

    if (!LOBBY_MASTER_ROLE_ID) return false;

    const userId = interactionOrUser.user ? interactionOrUser.user.id : interactionOrUser.id;
    if (!guild) {
        consola.warn("[isUserQueueManager] Guild object is undefined for queue manager check.");
        return false;
    }
    const member = guild.members.cache.get(userId);
    return member && member.roles.cache.has(LOBBY_MASTER_ROLE_ID);
}

async function attemptMovePlayerToLobby(interaction, userId, guild) {
    let moveStatusMessage = '';
    try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
            moveStatusMessage = `Nie znaleziono gracza <@${userId}> na serwerze.`;
            return moveStatusMessage;
        }

        const dmMessage = `📢 Właśnie zwolnił się slot na Amonga!\n\n🔪 Wbijaj na serwer [PSYCHOPACI](https://discord.gg/psychopaci)\n\n⏰ Czasu nie ma za wiele!`;
        try {
            await member.send(dmMessage);
            consola.info(`[Queue Pull] Sent DM to ${member.user.tag} (${userId}) about being pulled from queue.`);
        } catch (dmError) {
            consola.warn(`[Queue Pull] Could not send DM to ${member.user.tag} (${userId}). They might have DMs disabled. Error: ${dmError.message}`);
        }

        if (member.voice.channelId && member.voice.channelId === WAITING_ROOM_VOICE_CHANNEL_ID) {
            await member.voice.setChannel(GAME_LOBBY_VOICE_CHANNEL_ID);
            moveStatusMessage = `Gracz <@${userId}> został przeniesiony z poczekalni do lobby gry.`;
        } else if (member.voice.channelId) {
            moveStatusMessage = `Gracz <@${userId}> jest na innym kanale głosowym (<#${member.voice.channelId}>), nie w poczekalni. Nie został przeniesiony, ale został powiadomiony.`;
        } else {
            moveStatusMessage = `Gracz <@${userId}> nie jest na żadnym kanale głosowym, ale został powiadomiony.`;
        }
    } catch (error) {
        consola.error(`[MovePlayer] Error moving user ${userId} or sending DM:`, error);
        if (error.code === 50013) {
            moveStatusMessage = `Nie udało się przenieść gracza <@${userId}> - brak uprawnień bota do przenoszenia.`;
        } else if (error.code === 50001) {
            moveStatusMessage = `Nie udało się przenieść gracza <@${userId}> - brak dostępu bota do kanału.`;
        } else {
            moveStatusMessage = `Nie udało się przenieść gracza <@${userId}> (błąd: ${error.message}).`;
        }
    }
    return moveStatusMessage;
}


function getQueueEmbed() {
    const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('🔪 Lobby pełne? Zajmij miejsce w kolejce! 🔪')
        .setDescription('Użyj przycisków poniżej, aby zarządzać swoim miejscem w kolejce.')
        .addFields({ name: 'Rozmiar kolejki', value: `**${currentQueue.length}** graczy` });

    if (isLobbyLocked) {
        let lockReason = "Lobby osiągnęło limit graczy (18+).";
        if (currentQueue.length > 0) {
            lockReason = "W kolejce są oczekujący gracze LUB lobby jest pełne (18+).";
        }
        embed.addFields({ name: '🔒 Lobby Zamknięte', value: `${lockReason} Tylko osoby z kolejki (lub admini) mogą dołączyć.` });
    }


    if (currentQueue.length > 0) {
        const queueList = currentQueue.map((userId, index) => `${index + 1}. <@${userId}>`).join('\n');
        embed.addFields({ name: 'Aktualnie w kolejce:', value: queueList });
    } else {
        embed.addFields({ name: 'Aktualnie w kolejce:', value: 'Kolejka jest pusta!' });
    }
    embed.setFooter({ text: `Queue Bot | ${new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` });
    return embed;
}

function getQueueActionRow(canManageQueue = false) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('queue_join')
                .setLabel('Dołącz')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId('queue_leave')
                .setLabel('Opuść')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

    if (canManageQueue) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('queue_pull_next')
                .setLabel('Pull')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('⬆️')
        );
    }
    return row;
}

async function updateQueueMessage(interaction) {
    if (!queueMessage) {
        consola.debug('updateQueueMessage: queueMessage is null, skipping update. Use /kolejka start to initialize.');
        return;
    }

    try {
        const guild = interaction?.guild || await client.guilds.fetch(GUILD_ID);
        const showPullButton = OWNER_ID || LEADER_ROLE_ID || LOBBY_MASTER_ROLE_ID;

        if (GAME_LOBBY_VOICE_CHANNEL_ID) {
            const gameLobbyChannel = await guild.channels.fetch(GAME_LOBBY_VOICE_CHANNEL_ID).catch(() => null);
            if (gameLobbyChannel && gameLobbyChannel.type === ChannelType.GuildVoice) {
                const lobbyMemberCount = gameLobbyChannel.members.filter(m => !m.user.bot).size;
                isLobbyLocked = (currentQueue.length > 0 || lobbyMemberCount >= 18);
            }
        }

        await queueMessage.edit({ embeds: [getQueueEmbed()], components: [getQueueActionRow(showPullButton)] });
    } catch (error) {
        consola.error('Błąd podczas aktualizacji wiadomości kolejki:', error);
        if (error.code === 10008) {
            consola.warn('Wiadomość panelu kolejki została usunięta. Wyczyszczono ID.');
            queueMessage = null;
            saveQueueMessageId('');
        }
    }
}

async function getTempVoiceChannelControlPanelMessage(vcName, vcId, isLocked, client, guildId) {
    const guild = await client.guilds.fetch(guildId);
    const voiceChannel = await guild.channels.fetch(vcId).catch(() => null);
    let currentLimit = 0;
    if (voiceChannel) {
        currentLimit = voiceChannel.userLimit;
    }

    const embed = new EmbedBuilder()
        .setTitle(`⚙️ Panel Zarządzania Kanałem: ${vcName}`)
        .setDescription(`Status: ${isLocked ? '🔒 Zablokowany' : '🔓 Otwarty'}\nLimit miejsc: ${currentLimit === 0 ? 'Brak' : currentLimit}`)
        .setColor('#3498DB')
        .setFooter({text: `Kanał głosowy: ${vcName} (ID: ${vcId})`});

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tempvc_lock_${vcId}`).setLabel('Zablokuj').setStyle(ButtonStyle.Secondary).setEmoji('🔒').setDisabled(isLocked),
        new ButtonBuilder().setCustomId(`tempvc_unlock_${vcId}`).setLabel('Odblokuj').setStyle(ButtonStyle.Secondary).setEmoji('🔓').setDisabled(!isLocked),
        new ButtonBuilder().setCustomId(`tempvc_rename_modal_${vcId}`).setLabel('Nazwa').setStyle(ButtonStyle.Primary).setEmoji('✍️'),
        new ButtonBuilder().setCustomId(`tempvc_limit_modal_${vcId}`).setLabel('Limit').setStyle(ButtonStyle.Primary).setEmoji('👥')
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tempvc_permit_select_${vcId}`).setLabel('Pozwól').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId(`tempvc_reject_select_${vcId}`).setLabel('Zablokuj').setStyle(ButtonStyle.Danger).setEmoji('🚫'),
        new ButtonBuilder().setCustomId(`tempvc_kick_select_${vcId}`).setLabel('Wyrzuć').setStyle(ButtonStyle.Danger).setEmoji('👟')
    );

    const components = [row1, row2];
    consola.debug(`[getTempVoiceChannelControlPanelMessage] Generated components for VC ${vcId}:`, JSON.stringify(components.map(c => c.toJSON()), null, 2));
    return { embeds: [embed], components: components };
}


// --- BOT SETUP ---
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMembers] });
const votes = new Collection();
let voteMessage = null;
const temporaryVoiceChannels = new Map();
const monitoredVcSessionJoins = new Map();


async function manualStartPoll(interaction) {
    if (!isUserAdmin(interaction, interaction.guild)) {
        return interaction.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });
    }

    try {
        const pollChannelId = CHANNEL_ID || DEFAULT_POLL_CHANNEL_ID;
        if (!pollChannelId) {
             consola.error('[Manual Poll Start] Brak skonfigurowanego CHANNEL_ID dla ankiet.');
             return interaction.reply({ content: '❌ Kanał dla ankiet nie jest skonfigurowany.', ephemeral: true });
        }
        const pollChannel = await client.channels.fetch(pollChannelId);

        if (!pollChannel) {
            consola.error(`[Manual Poll Start] Nie znaleziono kanału dla ankiet (ID: ${pollChannelId})`);
            return interaction.reply({ content: '❌ Nie znaleziono kanału dla ankiet.', ephemeral: true });
        }

        votes.clear();
        consola.info('[Manual Poll Start] Lokalna kolekcja głosów (votes) wyczyszczona.');

        const initialPollEmbeds = buildPollEmbeds(votes);

        const pollRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('vote_19').setEmoji('<:amongus:1369715159806902393>').setLabel('A może wcześniej? (19:00)').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('vote_20').setEmoji('<:catJAM:1369714552916148224>').setLabel('Będę! (20:00)').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('vote_21').setEmoji('<:VibingRabbit:1369714461568663784>').setLabel('Będę, ale później (21:00)').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('vote_22').setEmoji('<:SUSSY:1369714561938362438>').setLabel('Będę, ale później (22:00)').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('poll_show_voters').setEmoji('👀').setLabel('Pokaż Głosujących').setStyle(ButtonStyle.Secondary)
        );

        let contentMessage = '';
        if (ROLE_ID) {
            contentMessage = `<@&${ROLE_ID}>`;
        }

        if (voteMessage) {
            try {
                await voteMessage.delete();
                consola.info('[Manual Poll Start] Stara wiadomość ankiety (voteMessage) usunięta.');
            } catch (e) {
                consola.warn('[Manual Poll Start] Nie udało się usunąć starej voteMessage (mogła już nie istnieć).');
            }
        }

        voteMessage = await pollChannel.send({ content: contentMessage, embeds: initialPollEmbeds, components: [pollRow] });
        consola.info(`[Manual Poll Start] Ankieta godzinowa została wysłana na kanał ${pollChannel.name} (ID: ${voteMessage.id})`);
        await interaction.reply({ content: `✅ Ankieta testowa uruchomiona w <#${pollChannel.id}>!`, ephemeral: true });

    } catch (e) {
        consola.error('[Manual Poll Start] Error starting manual poll:', e);
        await interaction.reply({ content: '❌ Wystąpił błąd podczas uruchamiania ankiety testowej.', ephemeral: true });
    }
}


client.once('ready', async () => {
    consola.success(`✅ Logged in as ${client.user.tag}`);

    await registerCommands();

    const panelChannelIdToUse = PANEL_CHANNEL_ID || DEFAULT_PANEL_CHANNEL_ID;
    if (panelChannelIdToUse) {
        const panelCh = await client.channels.fetch(panelChannelIdToUse).catch(e => {
            consola.error(`[Panel] Failed to fetch PANEL_CHANNEL_ID ${panelChannelIdToUse}: ${e.message}`);
            return null;
        });
        if (panelCh) {
            let panelMessageId = loadPanelMessageId();
            let panelMsg = null;

            const guild = await client.guilds.fetch(GUILD_ID).catch(e => {
                consola.error(`[Panel] Failed to fetch GUILD_ID ${GUILD_ID} for initial panel: ${e.message}`);
                return null;
            });

            const panelContent = { embeds: [getPanelEmbed(guild)] };
            const panelComponentsRow = getPanelRow();
            if (panelComponentsRow && panelComponentsRow.components.length > 0) {
                panelContent.components = [panelComponentsRow];
            } else {
                panelContent.components = [];
            }

            if (panelMessageId) {
                try {
                    panelMsg = await panelCh.messages.fetch(panelMessageId);
                    consola.info(`[Panel] Loaded existing panel message (ID: ${panelMessageId}) from channel ${panelCh.name}`);
                } catch (err){
                    consola.warn(`[Panel] Failed to fetch existing panel message (ID: ${panelMessageId}), will create a new one. Error: ${err.message}`);
                    panelMessageId = null;
                }
            }

            if (!panelMsg) {
                try {
                    consola.info(`[Panel] No existing panel message found or fetch failed. Attempting to send a new one to ${panelCh.name}.`);
                    const sent = await panelCh.send(panelContent);
                    savePanelMessageId(sent.id);
                    consola.info(`[Panel] New panel created (ID: ${sent.id}) in channel ${panelCh.name}`);
                } catch (e) { consola.error("[Panel] Failed to create new panel message:", e); }
            } else {
                try {
                    await panelMsg.edit(panelContent);
                    consola.info(`[Panel] Panel refreshed (ID: ${panelMsg.id}) in channel ${panelCh.name}`);
                } catch (e) {
                    consola.error("[Panel] Failed to refresh existing panel message:", e);
                    try {
                        consola.warn(`[Panel] Attempting to send a new panel message as fallback to ${panelCh.name}.`);
                        const sent = await panelCh.send(panelContent);
                        savePanelMessageId(sent.id);
                        consola.info(`[Panel] New panel created (fallback) (ID: ${sent.id}) in channel ${panelCh.name}`);
                    } catch (e2) { consola.error("[Panel] Failed to create fallback panel message:", e2); }
                }
            }
        }
    } else {
        consola.warn("PANEL_CHANNEL_ID not configured, panel will not be displayed.");
    }

    const queueChannelIdToUse = QUEUE_CHANNEL_ID || DEFAULT_QUEUE_CHANNEL_ID;
    if (queueChannelIdToUse) {
        const queueChannelObj = await client.channels.fetch(queueChannelIdToUse).catch(err => {
            consola.error(`Nie można załadować kanału kolejki o ID ${queueChannelIdToUse}: ${err}`);
            return null;
        });

        if (queueChannelObj) {
            const qMsgId = loadQueueMessageId();
            if (qMsgId) {
                try {
                    queueMessage = await queueChannelObj.messages.fetch(qMsgId);
                    consola.info(`Queue message loaded (ID: ${queueMessage.id}). Performing initial update.`);
                    const guild = await client.guilds.fetch(GUILD_ID);
                    await updateQueueMessage({ guild: guild, channel: queueMessage.channel });
                    consola.info(`Queue message refreshed (ID: ${queueMessage.id})`);
                } catch (err) {
                    consola.warn(`Nie udało się załadować wiadomości kolejki (ID: ${qMsgId}). Prawdopodobnie została usunięta. Użyj /kolejka start.`);
                    queueMessage = null;
                    saveQueueMessageId('');
                }
            } else {
                consola.info('Brak zapisanej wiadomości kolejki. Użyj /kolejka start, aby ją utworzyć.');
            }
        }
    } else {
        consola.warn("QUEUE_CHANNEL_ID not configured, queue panel might not function correctly.");
    }

    try {
        if(GAME_LOBBY_VOICE_CHANNEL_ID) {
            const gameLobby = await client.channels.fetch(GAME_LOBBY_VOICE_CHANNEL_ID);
            if (gameLobby && gameLobby.type === ChannelType.GuildVoice) {
                const lobbyMemberCount = gameLobby.members.filter(m => !m.user.bot).size;
                isLobbyLocked = (currentQueue.length > 0 || lobbyMemberCount >= 18);
                consola.info(`Lobby (ID: ${GAME_LOBBY_VOICE_CHANNEL_ID}) has ${lobbyMemberCount} players. Queue length: ${currentQueue.length}. isLobbyLocked = ${isLobbyLocked}.`);
            }
        } else {
            consola.warn("GAME_LOBBY_VOICE_CHANNEL_ID not set, lobby protection disabled and /ktosus might not work as expected.");
        }
    } catch (error) {
        consola.error(`Nie udało się sprawdzić stanu lobby przy starcie: ${error}`);
    }

    schedule.scheduleJob('0 10 * * *', async () => {
        try {
            const pollChannelIdToUse = CHANNEL_ID || DEFAULT_POLL_CHANNEL_ID;
            if (!pollChannelIdToUse) {
                consola.error("Scheduled Poll: CHANNEL_ID not configured for polls."); return;
            }
            const pollChannel = await client.channels.fetch(pollChannelIdToUse);
            if (!pollChannel) {
                consola.error(`Scheduled Poll: Nie znaleziono kanału dla ankiet (ID: ${pollChannelIdToUse})`);
                return;
            }
            votes.clear();
            consola.info('Scheduled Poll: Lokalna kolekcja głosów (votes) wyczyszczona przed nową ankietą.');
            const initialPollEmbeds = buildPollEmbeds(votes);
            const pollRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('vote_19').setEmoji('<:amongus:1369715159806902393>').setLabel('A może wcześniej? (19:00)').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('vote_20').setEmoji('<:catJAM:1369714552916148224>').setLabel('Będę! (20:00)').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('vote_21').setEmoji('<:VibingRabbit:1369714461568663784>').setLabel('Będę, ale później (21:00)').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('vote_22').setEmoji('<:SUSSY:1369714561938362438>').setLabel('Będę, ale później (22:00)').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('poll_show_voters').setEmoji('👀').setLabel('Pokaż Głosujących').setStyle(ButtonStyle.Secondary)
            );
            let contentMessage = '';
            if (ROLE_ID) {
                contentMessage = `<@&${ROLE_ID}>`;
            }
            if (voteMessage) {
                try {
                    await voteMessage.delete();
                    consola.info('Scheduled Poll: Stara wiadomość ankiety (voteMessage) usunięta.');
                } catch (e) {
                    consola.warn('Scheduled Poll: Nie udało się usunąć starej voteMessage (mogła już nie istnieć).');
                }
            }
            voteMessage = await pollChannel.send({ content: contentMessage, embeds: initialPollEmbeds, components: [pollRow] });
            consola.info(`Scheduled Poll: Ankieta godzinowa została wysłana na kanał ${pollChannel.name} (ID: ${voteMessage.id}) o 10:00 czasu serwera`);
        } catch (e) { consola.error('Error scheduling vote start:', e); }
    });

    schedule.scheduleJob('0 16 * * *', async () => {
        try {
            if (voteMessage) {
                const result = await endVoting(voteMessage, votes, true);
                if (result) {
                    consola.info('Scheduled Poll: Głosowanie zakończone automatycznie o 16:00 i wyniki ogłoszone.');
                    voteMessage = null;
                } else {
                    consola.error("Scheduled Poll: endVoting returned false at 16:00.");
                }
            } else {
                consola.info('Scheduled Poll: Próba zakończenia głosowania o 16:00, ale wiadomość ankiety (voteMessage) nie jest aktywna lub nie istnieje.');
            }
        } catch (e) { consola.error('Error scheduling vote end at 16:00:', e); }
    });

    schedule.scheduleJob('0 0 * * *', resetPollBonusData);

    schedule.scheduleJob('5 9 * * 1', async () => {
        try {
            const guild = await client.guilds.fetch(GUILD_ID);
            if (!guild) {
                consola.error(`[Weekly MVP] Guild (ID: ${GUILD_ID}) not found.`);
                return;
            }

            let mvpOfTheWeekId = null;
            let topPlayerPoints = -1;

            const sortedPlayers = getSortedRanking();

            if (sortedPlayers.length > 0) {
                mvpOfTheWeekId = sortedPlayers[0][0];
                topPlayerPoints = sortedPlayers[0][1];
            }

            if (MVP_ROLE_ID) {
                const mvpRole = await guild.roles.fetch(MVP_ROLE_ID).catch(() => null);
                if (mvpRole) {
                    const previousMvps = guild.members.cache.filter(member => member.roles.cache.has(mvpRole.id));
                    for (const member of previousMvps.values()) {
                        if (member.id !== mvpOfTheWeekId) {
                            await member.roles.remove(mvpRole).catch(e => consola.error(`Failed to remove MVP role from ${member.user.tag}: ${e.message}`));
                            consola.info(`Removed MVP role from ${member.user.tag}`);
                        }
                    }
                    if (mvpOfTheWeekId) {
                        const mvpMember = await guild.members.fetch(mvpOfTheWeekId).catch(() => null);
                        if (mvpMember) {
                            if (!mvpMember.roles.cache.has(mvpRole.id)) {
                                await mvpMember.roles.add(mvpRole).catch(e => consola.error(`Failed to add MVP role to ${mvpMember.user.tag}: ${e.message}`));
                                consola.info(`Awarded MVP role to ${mvpMember.user.tag}`);
                            } else {
                                consola.info(`${mvpMember.user.tag} already has the MVP role.`);
                            }
                        } else {
                            consola.warn(`[Weekly MVP] Top player ${mvpOfTheWeekId} not found in guild.`);
                            mvpOfTheWeekId = null;
                        }
                    }
                } else {
                    consola.error(`[Weekly MVP] MVP Role (ID: ${MVP_ROLE_ID}) not found.`);
                    mvpOfTheWeekId = null;
                }
            } else {
                consola.warn("[Weekly MVP] MVP_ROLE_ID is not set. Skipping MVP role assignment.");
                mvpOfTheWeekId = null;
            }

            const weeklyMvpTargetChannelId = WEEKLY_MVP_CHANNEL_ID || PANEL_CHANNEL_ID || DEFAULT_PANEL_CHANNEL_ID;
            if (!weeklyMvpTargetChannelId) {
                consola.error("Weekly MVP Ranking: No target channel configured (WEEKLY_MVP_CHANNEL_ID or PANEL_CHANNEL_ID).");
                return;
            }
            const targetChannel = await client.channels.fetch(weeklyMvpTargetChannelId).catch(err => {
                consola.error(`[Weekly MVP] Failed to fetch target channel ID ${weeklyMvpTargetChannelId}: ${err.message}`);
                return null;
            });

            if (targetChannel) {
                const top10Players = sortedPlayers.slice(0, 10);
                const rankingDescription = top10Players.map(([userId, points], i) => {
                    let mvpMarker = '';
                    if (userId === mvpOfTheWeekId) {
                        mvpMarker = ' 👑 **MVP Tygodnia!**';
                    }
                    return `${i + 1}. <@${userId}> – ${points} pkt${mvpMarker}`;
                }).join('\n');

                let mvpAnnouncement = "";
                if (mvpOfTheWeekId) {
                    mvpAnnouncement = `\n\n👑 **MVP Tygodnia:** <@${mvpOfTheWeekId}> z ${topPlayerPoints} pkt! Gratulacje!`;
                } else if (sortedPlayers.length > 0) {
                    mvpAnnouncement = "\n\n👑 Nie udało się ustalić MVP tygodnia (np. brak roli lub gracz opuścił serwer)."
                } else {
                    mvpAnnouncement = "\n\n👑 Brak graczy w rankingu, aby wyłonić MVP.";
                }
                
                const finalDescription = (rankingDescription || 'Brak danych do wyświetlenia.') + mvpAnnouncement;

                const embed = new EmbedBuilder()
                    .setTitle('🔪MVP AMONG TYGODNIA🔪')
                    .setDescription(finalDescription)
                    .setColor(0xDAA520)
                    .setImage(MVP_WEEKLY_RANKING_IMG_URL)
                    .setFooter({ text: "Gratulacje!!" });
                await targetChannel.send({ embeds: [embed] });
                consola.info(`[Weekly MVP] Sent weekly MVP announcement to channel ${targetChannel.name} (ID: ${targetChannel.id})`);
            } else {
                consola.error(`Nie znaleziono kanału ${weeklyMvpTargetChannelId} do wysłania cotygodniowego rankingu punktów MVP.`);
            }
        } catch (e) { consola.error('Error sending weekly score ranking or assigning MVP:', e); }
    });
});

client.on('interactionCreate', async i => {
    try {
        if (!i.inGuild()) return;

        if (i.isCommand()) consola.debug(`Received command: /${i.commandName}${i.options.getSubcommand(false) ? ' ' + i.options.getSubcommand(false) : ''} by ${i.user.tag}`);
        if (i.isButton()) consola.debug(`Received button interaction: ${i.customId} by ${i.user.tag}`);
        if (i.isModalSubmit()) consola.debug(`Received modal submit: ${i.customId} by ${i.user.tag}`);
        if (i.isStringSelectMenu()) consola.debug(`Received string select menu: ${i.customId} by ${i.user.tag} with values ${i.values.join(',')}`);
        if (i.isUserSelectMenu()) consola.debug(`Received user select menu: ${i.customId} by ${i.user.tag} with values ${i.values.join(',')}`);


        if (i.isButton()) {
            // ... (reszta handlerów przycisków) ...
        }

        // ... (reszta handlerów interakcji) ...

        if (!i.isChatInputCommand()) return;
        const commandName = i.commandName;
        const subcommandName = i.options.getSubcommand(false);

        if (commandName === 'ranking') {
            if (subcommandName === 'among') {
                const sortedPlayers = getSortedRanking();

                if (sortedPlayers.length === 0) {
                    return i.reply({ content: 'Brak danych do wyświetlenia w rankingu.', ephemeral: true });
                }

                const playersPerPage = 15;
                const totalPages = Math.ceil(sortedPlayers.length / playersPerPage);
                let currentPage = 0;

                const generateEmbed = (page) => {
                    const start = page * playersPerPage;
                    const end = start + playersPerPage;
                    const pagePlayers = sortedPlayers.slice(start, end);

                    const description = pagePlayers
                        .map(([userId, points], index) => `${start + index + 1}. <@${userId}> – ${points} pkt`)
                        .join('\n');

                    return new EmbedBuilder()
                        .setTitle('🏆 Pełny Ranking Punktów "Among" 🏆')
                        .setDescription(description)
                        .setColor(0xDAA520)
                        .setFooter({ text: `Strona ${page + 1} z ${totalPages}` });
                };

                const generateButtons = (page) => {
                    return new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('ranking_prev_page')
                            .setLabel('Poprzednia')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('◀️')
                            .setDisabled(page === 0),
                        new ButtonBuilder()
                            .setCustomId('ranking_next_page')
                            .setLabel('Następna')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('▶️')
                            .setDisabled(page >= totalPages - 1)
                    );
                };

                const reply = await i.reply({
                    embeds: [generateEmbed(currentPage)],
                    components: [generateButtons(currentPage)],
                    fetchReply: true,
                });

                const collector = reply.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 3 * 60 * 1000 // 3 minuty
                });

                collector.on('collect', async interaction => {
                    if (interaction.user.id !== i.user.id) {
                        return interaction.reply({ content: 'Tylko osoba, która wywołała komendę, może zmieniać strony.', ephemeral: true });
                    }

                    if (interaction.customId === 'ranking_prev_page') {
                        currentPage--;
                    } else if (interaction.customId === 'ranking_next_page') {
                        currentPage++;
                    }

                    await interaction.update({
                        embeds: [generateEmbed(currentPage)],
                        components: [generateButtons(currentPage)]
                    });
                });

                collector.on('end', () => {
                    const disabledButtons = generateButtons(currentPage);
                    disabledButtons.components.forEach(c => c.setDisabled(true));
                    reply.edit({ components: [disabledButtons] }).catch(err => consola.warn("Could not edit message to disable ranking buttons after collector ended:", err.message));
                });
                return;
            } else {
                 // Reszta subkomend /ranking
                if (!isUserAdmin(i, i.guild)) {
                    return i.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });
                }
                
                if (subcommandName === 'dodaj') {
                    const targetUser = i.options.getUser('uzytkownik');
                    const pointsToAdd = i.options.getInteger('liczba_punktow');
                    const reason = i.options.getString('powod') || 'Brak określonego powodu';
                    if (pointsToAdd <= 0) return i.reply({ content: '❌ Liczba punktów do dodania musi być dodatnia.', ephemeral: true });
                    updateWynikRank(targetUser.id, pointsToAdd);
                    const currentPoints = loadWynikRank();
                    const userNewPoints = currentPoints[targetUser.id] || 0;
                    consola.info(`[Admin] ${i.user.tag} dodał ${pointsToAdd} pkt użytkownikowi ${targetUser.tag} (Nowe punkty: ${userNewPoints}). Powód: ${reason}`);
                    return i.reply({ content: `✅ Dodano ${pointsToAdd} pkt użytkownikowi <@${targetUser.id}>. Nowa liczba punktów: ${userNewPoints}.\nPowód: ${reason}`, ephemeral: true });
                } else if (subcommandName === 'usun') {
                    const userToRemovePoints = i.options.getUser('uzytkownik');
                    const pointsToRemove = i.options.getInteger('liczba_punktow');
                    if (pointsToRemove <= 0) return i.reply({ content: '❌ Liczba punktów do usunięcia musi być dodatnia.', ephemeral: true });
                    const currentPointsData = loadWynikRank();
                    const userCurrentPoints = currentPointsData[userToRemovePoints.id] || 0;
                    if (userCurrentPoints === 0) return i.reply({ content: `ℹ️ Użytkownik <@${userToRemovePoints.id}> nie posiada żadnych punktów.`, ephemeral: true });
                    const newPoints = Math.max(0, userCurrentPoints - pointsToRemove);
                    currentPointsData[userToRemovePoints.id] = newPoints;
                    saveWynikRank(currentPointsData);
                    consola.info(`[Admin] Usunięto ${pointsToRemove} pkt użytkownikowi ${userToRemovePoints.tag}. Nowa liczba punktów: ${newPoints}. Akcja wykonana przez: ${i.user.tag}`);
                    return i.reply({ content: `✅ Usunięto ${pointsToRemove} pkt użytkownikowi <@${userToRemovePoints.id}>. Nowa liczba punktów: ${newPoints}.`, ephemeral: true });
                } else if (subcommandName === 'clear') {
                    saveWynikRank({});
                    consola.info(`[Admin] Ranking punktów (wynikRank.json) został wyczyszczony przez ${i.user.tag}.`);
                    await i.reply({ content: '✅ Ranking punktów został pomyślnie wyczyszczony!', ephemeral: true });
                }
            }
        } else if (commandName === 'ktosus') {
            if (!isUserQueueManager(i, i.guild)) {
                return i.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });
            }
            if (!i.guild) return i.reply({ content: 'Tej komendy można użyć tylko na serwerze.', ephemeral: true});

            const cooldowns = loadJSON(KTOSUS_COOLDOWNS_FILE, {});
            const now = Date.now();
            const userCooldown = cooldowns[i.user.id];

            if (userCooldown && (now - userCooldown < KTOSUS_COOLDOWN_DURATION) && i.user.id !== OWNER_ID) {
                const timeLeftMs = KTOSUS_COOLDOWN_DURATION - (now - userCooldown);
                const hours = Math.floor(timeLeftMs / (1000 * 60 * 60));
                const minutes = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));
                return i.reply({ content: `Musisz poczekać jeszcze ${hours}h ${minutes}m, zanim znowu użyjesz tej komendy.`, ephemeral: true });
            }

            if (!GAME_LOBBY_VOICE_CHANNEL_ID) {
                return i.reply({ content: 'Kanał lobby gry nie jest skonfigurowany. Nie można wybrać podejrzanego.', ephemeral: true });
            }

            try {
                const gameLobbyChannel = await i.guild.channels.fetch(GAME_LOBBY_VOICE_CHANNEL_ID).catch(() => null);
                if (!gameLobbyChannel || gameLobbyChannel.type !== ChannelType.GuildVoice) {
                    return i.reply({ content: 'Nie znaleziono kanału lobby gry lub nie jest to kanał głosowy.', ephemeral: true });
                }

                const membersInLobby = gameLobbyChannel.members.filter(member => !member.user.bot);
                if (membersInLobby.size === 0) {
                    return i.reply({ content: 'Lobby gry jest puste! Nie ma kogo wybrać. 😉', ephemeral: true });
                }

                const membersArray = Array.from(membersInLobby.values());
                const randomMember = membersArray[Math.floor(Math.random() * membersArray.length)];

                if (i.user.id !== OWNER_ID) {
                    cooldowns[i.user.id] = now;
                    saveJSON(KTOSUS_COOLDOWNS_FILE, cooldowns);
                }

                const randomMessageTemplate = KTOSUS_MESSAGES[Math.floor(Math.random() * KTOSUS_MESSAGES.length)];
                const finalMessage = randomMessageTemplate.replace(/@nick/g, `<@${randomMember.id}>`);

                return i.reply(finalMessage);
            } catch (err) {
                consola.error("Error in /ktosus command:", err);
                return i.reply({ content: 'Nie udało się wybrać podejrzanego, spróbuj ponownie.', ephemeral: true});
            }
        }
        
        // ... (pozostałe handlery komend, np. /kolejka, /ankieta, /win) ...

    } catch (e) {
        const interactionDetails = i.isCommand() ? i.commandName : (i.isButton() || i.isModalSubmit() || i.isAnySelectMenu() ? i.customId : 'unknown interaction');
        consola.error(`Error during interaction '${interactionDetails}' by ${i.user.tag} in guild ${i.guild?.id || 'DM'}:`, e);
        try {
            const owner = await client.users.fetch(OWNER_ID).catch(() => null);
            if(owner) {
                await owner.send(`Wystąpił krytyczny błąd w interakcji '${interactionDetails}' na serwerze '${i.guild?.name || 'DM'}', wywołanej przez '${i.user.tag}':\n\`\`\`${e.stack || e.message}\`\`\``).catch(dmErr => consola.error("Failed to send error DM to owner:", dmErr));
            }

            if (i.replied || i.deferred) {
                await i.followUp({ content: '❌ Wystąpił błąd podczas przetwarzania Twojego żądania. Administrator został powiadomiony.', ephemeral: true });
            } else {
                await i.reply({ content: '❌ Wystąpił błąd podczas przetwarzania Twojego żądania. Administrator został powiadomiony.', ephemeral: true });
            }
        } catch (replyError) {
            consola.error('Dodatkowy błąd podczas próby odpowiedzi na błąd interakcji:', replyError);
        }
    }
});

// ... (funkcja `voiceStateUpdate` i `attemptLogin` bez zmian) ...
// Poniżej wklejam je dla kompletności
function formatDuration(durationMs) {
    if (durationMs < 1000) return "mniej niż sekundę";
    const seconds = Math.floor((durationMs / 1000) % 60);
    const minutes = Math.floor((durationMs / (1000 * 60)) % 60);
    const hours = Math.floor((durationMs / (1000 * 60 * 60)) % 24);
    const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));

    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}g`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(', ');
}

client.on('voiceStateUpdate', async (oldState, newState) => {
    // ... cała treść funkcji bez zmian ...
});

function attemptLogin(retries = 5) {
    client.login(DISCORD_TOKEN).catch(err => {
        consola.error(`Login attempt failed. Retries left: ${retries}. Error: ${err.message}`);
        if (retries > 0) {
            consola.info(`Retrying login in 5 seconds...`);
            setTimeout(() => attemptLogin(retries - 1), 5000);
        } else {
            consola.error('Max login retries reached. Exiting.');
            process.exit(1);
        }
    });
}
attemptLogin();