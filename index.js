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
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const consola = require('consola');
const schedule = require('node-schedule');

// --- ENV VALIDATION ---
const {
    DISCORD_TOKEN,
    CLIENT_ID,
    OWNER_ID,
    CHANNEL_ID, // Kanał dla ankiet
    ROLE_ID,      // Rola pingowana przy ankietach
    GUILD_ID,     // Kluczowe dla działania na jednym serwerze
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
    POLL_PARTICIPANTS_LOG_CHANNEL_ID,
    AMONG_GAMES_API_URL,
    AMONG_GAMES_API_TOKEN,
    AMONG_GAMES_API_SECRET
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
checkEnvVar('AMONG_GAMES_API_URL', AMONG_GAMES_API_URL, 'Among Us Games API URL', false);
checkEnvVar('AMONG_GAMES_API_TOKEN', AMONG_GAMES_API_TOKEN, 'Among Us Games API Token', false);
checkEnvVar('AMONG_GAMES_API_SECRET', AMONG_GAMES_API_SECRET, 'Among Us Games API Secret', false);


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
const MVP_WEEKLY_RANKING_IMG_URL = 'https://i.imgur.com/9Unne8r.png';


const POLL_BONUS_STATUS_FILE = path.join(DATA_DIR, 'pollBonusStatus.json');
const WYNIK_RANK_FILE = path.join(DATA_DIR, 'wynikRank.json');
const PANEL_ID_FILE = path.join(DATA_DIR, 'panel_message_id.txt');
const QUEUE_MESSAGE_ID_FILE = path.join(DATA_DIR, 'queue_message_id.txt');
const FACTION_STATS_FILE = path.join(DATA_DIR, 'factionStats.json');
const WELCOME_DM_SENT_USERS_FILE = path.join(DATA_DIR, 'welcomeDmSentUsers.json');
const KTOSUS_COOLDOWNS_FILE = path.join(DATA_DIR, 'ktosusCooldowns.json');
const PROCESSED_GAME_IDS_FILE = path.join(DATA_DIR, 'processedGameIds.json');

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

function getWynikRanking(includeMvpMention = false, mvpUserId = null, showAll = false) {
    const wr = loadWynikRank();
    let sortedEntries = Object.entries(wr)
        .sort(([, aPoints], [, bPoints]) => bPoints - aPoints);

    if (!showAll) {
        sortedEntries = sortedEntries.slice(0, 10);
    }

    const sortedDisplay = sortedEntries.map(([userId, points], i) => {
            let mvpMarker = '';
            if (includeMvpMention && userId === mvpUserId && !showAll) {
                mvpMarker = ' 👑 **MVP Tygodnia!**';
            }
            return `${i + 1}. <@${userId}> – ${points} pkt${mvpMarker}`;
        });

    const rankingText = sortedDisplay.length ? sortedDisplay.join('\n') : 'Brak danych do wyświetlenia.\nZacznijcie grać i zdobywać punkty!';
    return rankingText;
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
    // ... (reszta GIFów)
];

const WINNING_POLL_GIFS = POLL_CELEBRATION_GIFS.filter(gif => gif.endsWith('.gif') || gif.includes('giphy.gif'));
if (WINNING_POLL_GIFS.length === 0) {
    WINNING_POLL_GIFS.push('https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3g0YnRzOTdvajg0YXQxb2xlcTl6aTFqYm9qMmxla2N1d3BlNjJ5eiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/vFnxro4sFV1R5b95xs/giphy.gif');
}

const TIE_POLL_GIF = 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3g0YnRzOTdvajg0YXQxb2xlcTl6aTFqYm9qMmxla2N1d3BlNjJ5eiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/l8TwxjgFRhDASPGuXc/giphy.gif';
const NO_VOTES_GIF = 'https://media.giphy.com/media/yAnC4g6sUpX0MDkGOg/giphy.gif';
const DEFAULT_POLL_GIF = 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3g0YnRzOTdvajg0YXQxb2xlcTl6aTFqYm9qMmxla2N1d3BlNjJ5eiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/vFnxro4sFV1R5b95xs/giphy.gif';

const KTOSUS_COOLDOWN_DURATION = 24 * 60 * 60 * 1000;
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
    "Adamesko znowu krzyczy \"spokój!\", a @nick właśnie planuje cichy sabotaż.",
    "Kiedy @nick robi coś głupiego, ADM Zerashi już ładuje \"kurwa\" z szewską pasją.",
    "Kilah może gra raz na sto lat, ale @nick zabija w każdej rundzie. Przypadek?",
    "Zwierzak zna mapy z geoguessr, a @nick zna tylko trasy do najbliższego trupa.",
    "Amae jeszcze nie zdążyła wejść na VC, a @nick już zabił pół załogi.",
    "@nick i kabelki? Przecież to jest daltonista! MEGA SUS!",
    "Nawet jeśli @nick nie jest impostorem to i tak ma coś na sumieniu..."
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
                subcommand.setName('pull')
                .setDescription('Pobiera X pierwszych graczy z kolejki (admin/mistrz lobby).')
                .addIntegerOption(option => option.setName('liczba').setDescription('Liczba osób do pobrania (domyślnie 1).').setRequired(false).setMinValue(1))
            )
            .addSubcommand(subcommand =>
                subcommand.setName('pull_user')
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
                .setDescription('Wyświetla pełny ranking wszystkich graczy.')
            )
            .addSubcommand(subcommand =>
                subcommand.setName('aktualizuj_z_api')
                .setDescription('Pobiera i przetwarza wyniki gier z API (admin).')
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
            .setDescription('Losowo wybiera podejrzaną osobę z lobby gry (admin/mistrz lobby, cooldown 24h).')
            .toJSON()
    );

    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        consola.info(`[Commands] Registering ${cmds.length} application (/) commands.`);
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: cmds }
        );
        consola.success(`✅ Successfully registered ${cmds.length} application (/) commands in guild ${GUILD_ID}`);
    } catch (error) {
        consola.error(`❌ Failed to register application (/) commands in guild ${GUILD_ID}:`, error);
    }
}

// --- API Integration Functions ---
async function fetchGameResultsFromApi(date = null) {
    if (!AMONG_GAMES_API_URL || !AMONG_GAMES_API_TOKEN || !AMONG_GAMES_API_SECRET) {
        consola.error('[API Fetch] API URL, Token, or Secret is not configured. Skipping API fetch.');
        return null;
    }
    try {
        let requestUrl = `${AMONG_GAMES_API_URL}?token=${AMONG_GAMES_API_TOKEN}&secret=${AMONG_GAMES_API_SECRET}`;
        if (date) {
            requestUrl += `&dzien=${date}`;
        }
        consola.info(`[API Fetch] Attempting to fetch: ${requestUrl.replace(AMONG_GAMES_API_SECRET, '******')}`);
        const response = await axios.get(requestUrl, { timeout: 10000 }); // Dodano timeout
        if (response.data && response.data.success && Array.isArray(response.data.games)) {
            consola.info(`[API Fetch] Successfully fetched ${response.data.count} games.`);
            return response.data.games;
        } else {
            consola.warn('[API Fetch] API response was not successful or data format is unexpected:', response.data);
            return [];
        }
    } catch (error) {
        consola.error('[API Fetch] Error during API request:', error.message);
        if (error.response) {
            consola.error('[API Fetch] Error response data:', error.response.data);
            consola.error('[API Fetch] Error response status:', error.response.status);
        } else if (error.request) {
            consola.error('[API Fetch] No response received from API. Request details:', error.request);
        } else {
            consola.error('[API Fetch] Error setting up API request:', error.message);
        }
        return null;
    }
}

async function processGameResultsAndAwardPoints(gamesToProcess, interaction = null, discordClient = null) {
    const currentClient = interaction ? interaction.client : discordClient;
    if (!currentClient) {
        consola.error('[Process Results] CRITICAL: Discord client instance is not available.');
        return 0;
    }

    if (!gamesToProcess || gamesToProcess.length === 0) {
        consola.info('[Process Results] No new games to process from API.');
        if (interaction) await interaction.editReply({ content: 'ℹ️ Brak nowych gier do przetworzenia z API.' }).catch(e => consola.error("Error editing reply for no games:", e));
        return 0;
    }

    const processedGameIds = loadJSON(PROCESSED_GAME_IDS_FILE, []);
    let newGamesProcessedCount = 0;
    let pointsAwardedMessages = [];

    for (const game of gamesToProcess) {
        const gameIdentifier = game.gameDbId || game.gameId;
        if (!gameIdentifier) {
            consola.warn('[Process Results] Game data missing identifier (gameDbId or gameId):', game);
            continue;
        }
        if (processedGameIds.includes(gameIdentifier.toString())) {
            consola.info(`[Process Results] Game ${gameIdentifier} already processed. Skipping.`);
            continue;
        }

        consola.info(`[Process Results] Processing game ${gameIdentifier}... Winning Team: ${game.winningTeam}`);
        newGamesProcessedCount++;
        let gameSummary = [`\n**Gra ${game.lobbyCode || gameIdentifier} (${game.map || 'Nieznana mapa'}):**`];

        if (game.players && Array.isArray(game.players)) {
            let crewmateWinForStats = false;
            if (game.winningTeam && game.winningTeam.toLowerCase().includes("crewmates") && !game.winningTeam.toLowerCase().includes("lover")) {
                 crewmateWinForStats = true;
            }

            game.players.forEach(player => {
                if (!player.playerId || typeof player.playerId !== 'number' || !player.role) {
                    consola.warn(`[Process Results] Skipping player due to missing/invalid Discord ID (playerId should be a number) or role in game ${gameIdentifier}:`, player);
                    return;
                }
                const discordUserId = player.playerId.toString();

                let pointsToAward = 0;
                let awardedForRole = player.role;
                const playerRoleLower = player.role.toLowerCase();
                const winningTeamLower = game.winningTeam ? game.winningTeam.toLowerCase() : "";

                if (parseInt(player.isWinner) === 1) {
                    if (playerRoleLower.includes('crewmate') && winningTeamLower === 'crewmates') {
                        pointsToAward = 100;
                    } else if (playerRoleLower.includes('impostor') && winningTeamLower === 'impostors') {
                        pointsToAward = 200;
                    } else if (
                        (playerRoleLower.includes('lover') || (player.modifiers && player.modifiers.some(mod => mod.toLowerCase().includes('lover')))) &&
                        (winningTeamLower.includes('lover') || parseInt(player.isWinner) === 1)
                    ) {
                        pointsToAward = 300;
                        awardedForRole = `Lover (${player.role})`;
                        crewmateWinForStats = false;
                    } else if (!playerRoleLower.includes('crewmate') && !playerRoleLower.includes('impostor') && !playerRoleLower.includes('lover')) {
                        pointsToAward = 300;
                        awardedForRole = `Neutral (${player.role})`;
                        crewmateWinForStats = false;
                    }
                }

                if (pointsToAward > 0) {
                    updateWynikRank(discordUserId, pointsToAward);
                    const message = `Przyznano ${pointsToAward} pkt dla <@${discordUserId}> (Rola: ${awardedForRole}, Wygrana: Tak)`;
                    consola.info(`[Process Results] ${message}`);
                    gameSummary.push(message);
                }
            });

            if (crewmateWinForStats) {
                incrementCrewmateWins();
            }
        } else {
            consola.warn(`[Process Results] No player data in game ${gameIdentifier}`);
        }

        processedGameIds.push(gameIdentifier.toString());
        if (gameSummary.length > 1) {
            pointsAwardedMessages.push(...gameSummary);
        }
    }
    saveJSON(PROCESSED_GAME_IDS_FILE, processedGameIds);
    consola.info(`[Process Results] Finished processing. ${newGamesProcessedCount} new games logged for points.`);

    if (interaction) {
        if (newGamesProcessedCount > 0) {
            let replyMessage = `✅ Pomyślnie przetworzono ${newGamesProcessedCount} nowych gier z API.`;
            if (pointsAwardedMessages.length > 0) {
                replyMessage += "\n**Podsumowanie przyznanych punktów:**" + pointsAwardedMessages.join('\n');
                if (replyMessage.length > 1900) {
                    replyMessage = replyMessage.substring(0, 1900) + "\n... (więcej informacji w logach konsoli)";
                }
            } else {
                replyMessage += "\nNie przyznano żadnych nowych punktów w tych grach na podstawie obecnych zasad lub gry zostały już wcześniej przetworzone.";
            }
            await interaction.editReply({ content: replyMessage }).catch(e => consola.error("Error editing reply for processed games:", e));
        } else {
            await interaction.editReply({ content: 'ℹ️ Brak nowych gier do przetworzenia z API (mogły zostać już wcześniej przetworzone).'}).catch(e => consola.error("Error editing reply for no new games:", e));
        }
    } else if (newGamesProcessedCount > 0 && pointsAwardedMessages.length > 0 && PANEL_CHANNEL_ID && currentClient) {
        try {
            const summaryChannel = await currentClient.channels.fetch(PANEL_CHANNEL_ID);
            if(summaryChannel && summaryChannel.isTextBased()){
                let autoUpdateMessage = `🤖 Automatycznie przetworzono ${newGamesProcessedCount} gier z API.`;
                 if (pointsAwardedMessages.length > 0) {
                    autoUpdateMessage += "\n**Przyznane punkty:**" + pointsAwardedMessages.join('\n');
                     if (autoUpdateMessage.length > 1900) {
                        autoUpdateMessage = autoUpdateMessage.substring(0, 1900) + "\n... (więcej informacji w logach konsoli)";
                    }
                }
                // Zakomentowane, aby uniknąć spamu
                // await summaryChannel.send(autoUpdateMessage);
                // consola.info(`[API Auto-Update] Sent summary message to channel ${summaryChannel.name}.`);
            }
        } catch (e) {
            consola.error("[API Auto-Update] Failed to send summary message:", e);
        }
    }

    if (newGamesProcessedCount > 0 && PANEL_CHANNEL_ID && currentClient) {
        const panelCh = await currentClient.channels.fetch(PANEL_CHANNEL_ID || DEFAULT_PANEL_CHANNEL_ID).catch(() => null);
        const panelMessageId = loadPanelMessageId();
        if (panelCh && panelMessageId) {
            try {
                const panelMsgToEdit = await panelCh.messages.fetch(panelMessageId);
                const guild = await currentClient.guilds.fetch(GUILD_ID);
                await panelMsgToEdit.edit({ embeds: [getPanelEmbed(guild)], components: [getPanelRow()] });
                consola.info("[API Process] Ranking panel updated after processing API games.");
            } catch (e) {
                consola.error("[API Process] Failed to update ranking panel after API processing:", e);
            }
        }
    }
    return newGamesProcessedCount;
}

// --- Pozostałe funkcje (getPanelEmbed, itd.) są pełne ---
function getPanelEmbed(guild) {
    let rankingDescription = 'Ładowanie rankingu...';
    if (guild) {
        const wr = loadWynikRank();
        let currentMvpId = null;
        if (MVP_ROLE_ID) {
            const mvpRole = guild.roles.cache.get(MVP_ROLE_ID);
            if (mvpRole) {
                const mvpMember = guild.members.cache.find(m => m.roles.cache.has(mvpRole.id));
                if (mvpMember) currentMvpId = mvpMember.id;
            }
        }
        rankingDescription = getWynikRanking(true, currentMvpId, false);
    }

    return new EmbedBuilder()
        .setTitle('Admin Table Stats')
        .setColor(0xDAA520)
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
            summaryTitle = `🎉🎉🎉 Godzina ${winnerTime} Wygrywa! �🎉🎉`;
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

    if (LEADER_ROLE_ID || LOBBY_MASTER_ROLE_ID || OWNER_ID) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('queue_pull_next')
                .setLabel('Pull Następny')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎣')
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
        
        const showPullButton = isUserQueueManager(interaction?.user || { id: OWNER_ID, user: {id: OWNER_ID} }, guild);

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

    const components = [row1];
    if (row2.components.length > 0) {
        components.push(row2);
    }
    consola.debug(`[getTempVoiceChannelControlPanelMessage] Generated components for VC ${vcId}:`, JSON.stringify(components.map(c => c.toJSON()), null, 2));
    return { embeds: [embed], components: components };
}


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
    consola.info(`[DEBUG] Type of fetchGameResultsFromApi before scheduling: ${typeof fetchGameResultsFromApi}`);


    if (AMONG_GAMES_API_URL && AMONG_GAMES_API_TOKEN && AMONG_GAMES_API_SECRET) {
        schedule.scheduleJob('*/2 * * * *', async () => { // Użycie funkcji anonimowej dla pewności zasięgu
            try {
                consola.info('[Scheduled Task - API] Job execution started.');
                if (typeof fetchGameResultsFromApi !== 'function' || typeof processGameResultsAndAwardPoints !== 'function') {
                    consola.error('[Scheduled Task - API] CRITICAL: API functions not defined or accessible within scheduler callback!');
                    return;
                }
                consola.info('[Scheduled Task - API] Fetching game results every 2 minutes (inline function)...');
                const today = new Date().toISOString().slice(0, 10);
                const gameResults = await fetchGameResultsFromApi(today);
                if (gameResults) {
                    await processGameResultsAndAwardPoints(gameResults, null, client);
                }
                 consola.info('[Scheduled Task - API] Job execution finished.');
            } catch (error) {
                consola.error("[Scheduled Task - API] Unhandled error during scheduled job execution:", error);
            }
        });
        consola.info('[Scheduled Task - API] Automatic game result fetching is ENABLED (every 2 minutes).');
    } else {
        consola.warn('[Scheduled Task - API] API credentials for Among Us games are not configured. Automatic fetching disabled.');
    }


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

            const wr = loadWynikRank();
            const sortedPlayers = Object.entries(wr).sort(([, aPoints], [, bPoints]) => bPoints - aPoints);

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
                const rankingDescription = getWynikRanking(true, mvpOfTheWeekId, false);

                let mvpAnnouncement = "";
                if (mvpOfTheWeekId) {
                    mvpAnnouncement = `\n\n👑 **MVP Tygodnia:** <@${mvpOfTheWeekId}> z ${topPlayerPoints} pkt! Gratulacje!`;
                } else if (sortedPlayers.length > 0) {
                    mvpAnnouncement = "\n\n👑 Nie udało się ustalić MVP tygodnia (np. brak roli lub gracz opuścił serwer)."
                } else {
                    mvpAnnouncement = "\n\n👑 Brak graczy w rankingu, aby wyłonić MVP.";
                }

                const embed = new EmbedBuilder()
                    .setTitle('🔪MVP AMONG TYGODNIA🔪')
                    .setDescription(rankingDescription + mvpAnnouncement)
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
        if (i.isCommand()) consola.debug(`Received command: /${i.commandName}${i.options.getSubcommand(false) ? ' ' + i.options.getSubcommand(false) : ''} by ${i.user.tag}`);
        if (i.isButton()) consola.debug(`Received button interaction: ${i.customId} by ${i.user.tag}`);
        if (i.isModalSubmit()) consola.debug(`Received modal submit: ${i.customId} by ${i.user.tag}`);
        if (i.isStringSelectMenu()) consola.debug(`Received string select menu: ${i.customId} by ${i.user.tag} with values ${i.values.join(',')}`);
        if (i.isUserSelectMenu()) consola.debug(`Received user select menu: ${i.customId} by ${i.user.tag} with values ${i.values.join(',')}`);


        if (i.isButton()) {
            const panelMsgId = loadPanelMessageId();
            if (i.message.id === panelMsgId && i.customId === 'show_wynikirank') {
                await i.deferUpdate();
                const wr = loadWynikRank();
                const sortedPlayers = Object.entries(wr).sort(([, aPoints], [, bPoints]) => bPoints - aPoints);
                let currentMvpId = null;
                if (MVP_ROLE_ID && i.guild) {
                    const mvpRole = await i.guild.roles.fetch(MVP_ROLE_ID).catch(() => null);
                    if (mvpRole) {
                        const mvpMember = i.guild.members.cache.find(m => m.roles.cache.has(mvpRole.id));
                        if (mvpMember) currentMvpId = mvpMember.id;
                    }
                }

                const embed = new EmbedBuilder()
                    .setTitle('Admin Table Stats')
                    .setColor(0xDAA520)
                    .setDescription(getWynikRanking(true, currentMvpId));
                return i.editReply({ embeds: [embed], components: [getPanelRow()] });
            }
        }

        if (i.isButton() && i.customId.startsWith('vote_')) {
            if (!voteMessage || i.message.id !== voteMessage.id) {
                return i.reply({ content: 'To głosowanie jest już nieaktywne lub zakończone.', ephemeral: true });
            }
            const user = i.user;
            const newVote = i.customId;
            const oldVote = votes.get(user.id);

            let replyMessageContent = '';
            const pollBonusStatus = loadJSON(POLL_BONUS_STATUS_FILE, {});
            const today = new Date().toISOString().slice(0, 10);

            if (oldVote === newVote) {
                votes.delete(user.id);
                replyMessageContent = 'Twój głos został wycofany.';

                if (pollBonusStatus[user.id] === today) {
                    updateWynikRank(user.id, -100);
                    delete pollBonusStatus[user.id];
                    saveJSON(POLL_BONUS_STATUS_FILE, pollBonusStatus);
                    replyMessageContent += ' Bonusowe punkty za dzisiejszy pierwszy głos zostały odjęte.';
                    consola.info(`[Poll Voting] User ${user.tag} unvoted. Removed 100 bonus points for today. Bonus status reset for today.`);
                }
            } else {
                if (pollBonusStatus[user.id] !== today) {
                    addPollPoints(user.id);
                    pollBonusStatus[user.id] = today;
                    saveJSON(POLL_BONUS_STATUS_FILE, pollBonusStatus);
                    consola.info(`[Poll Voting] User ${user.tag} voted for the first time today. Added 100 bonus points.`);
                }
                votes.set(user.id, newVote);
                replyMessageContent = `Zagłosowałeś na ${newVote.replace('vote_', '')}:00.`;
            }

            if (voteMessage) {
                const updatedPollEmbeds = buildPollEmbeds(votes);
                await voteMessage.edit({ embeds: updatedPollEmbeds, components: voteMessage.components });
            }

            await i.reply({ content: replyMessageContent, ephemeral: true });
            return;
        }

        if (i.isButton() && i.customId === 'poll_show_voters') {
            if (!voteMessage || i.message.id !== voteMessage.id) {
                return i.reply({ content: 'Ankieta, dla której chcesz zobaczyć wyniki, jest już nieaktywna.', ephemeral: true });
            }

            const timeSelectMenu = new StringSelectMenuBuilder()
                .setCustomId('poll_select_time_for_voters')
                .setPlaceholder('Wybierz godzinę, aby zobaczyć głosy...')
                .addOptions([
                    { label: '19:00', value: 'vote_19', description: 'Pokaż, kto zagłosował na 19:00' },
                    { label: '20:00', value: 'vote_20', description: 'Pokaż, kto zagłosował na 20:00' },
                    { label: '21:00', value: 'vote_21', description: 'Pokaż, kto zagłosował na 21:00' },
                    { label: '22:00', value: 'vote_22', description: 'Pokaż, kto zagłosował na 22:00' },
                ]);
            const row = new ActionRowBuilder().addComponents(timeSelectMenu);
            await i.reply({ content: 'Wybierz godzinę, dla której chcesz zobaczyć listę głosujących:', components: [row], ephemeral: true });
            return;
        }

        if (i.isStringSelectMenu() && i.customId === 'poll_select_time_for_voters') {
            const selectedTimeVoteId = i.values[0];
            const timeLabel = selectedTimeVoteId.replace('vote_', '') + ":00";

            let votersList = [];
            votes.forEach((voteCustomId, userId) => {
                if (voteCustomId === selectedTimeVoteId) {
                    votersList.push(`<@${userId}>`);
                }
            });

            const embed = new EmbedBuilder()
                .setColor(0x8B0000)
                .setTitle(`👥 Głosujący na ${timeLabel}`)
                .setDescription(votersList.length > 0 ? votersList.join('\n') : 'Nikt jeszcze nie zagłosował na tę godzinę.')
                .setFooter({ text: `Lista głosujących na ${timeLabel}` });

            await i.update({ embeds: [embed], components: [] });
            return;
        }


        if (i.isButton() && i.customId.startsWith('points_role_')) {
            if (!isUserAdmin(i, i.guild)) {
                return i.reply({ content: '❌ Nie masz uprawnień do tej akcji.', ephemeral: true });
            }
            await i.deferUpdate();

            const roleType = i.customId.replace('points_role_', '');

            const userSelect = new UserSelectMenuBuilder()
                .setCustomId(`points_user_select_${roleType}`)
                .setPlaceholder('Wybierz graczy (max 25)...')
                .setMinValues(1)
                .setMaxValues(25);

            const rowSelect = new ActionRowBuilder().addComponents(userSelect);

            let roleNameDisplay = "Crewmate (+100 pkt)";
            if (roleType === 'neutral') roleNameDisplay = "Neutral (+300 pkt)";
            else if (roleType === 'impostor') roleNameDisplay = "Impostor (+200 pkt)";


            await i.editReply({
                content: `Wybrano: **${roleNameDisplay}**. Teraz wybierz graczy, którzy ją pełnili:`,
                components: [rowSelect],
                embeds: []
            });
            consola.info(`[Points System] Leader ${i.user.tag} selected role ${roleType}, presenting user select menu.`);
            return;
        }

        if (i.isUserSelectMenu() && i.customId.startsWith('points_user_select_')) {
            if (!isUserAdmin(i, i.guild)) {
                return i.reply({ content: '❌ Nie masz uprawnień do tej akcji.', ephemeral: true });
            }
            await i.deferUpdate();

            const roleType = i.customId.replace('points_user_select_', '');
            const selectedUserIds = i.values;
            let summaryLines = [];

            let crewmateWinIncrement = 0;

            for (const userId of selectedUserIds) {
                const member = await i.guild.members.fetch(userId).catch(() => null);
                if (!member) {
                    summaryLines.push(`⚠️ Nie można znaleźć gracza o ID: ${userId} na serwerze. Punkty nie zostały przyznane.`);
                    continue;
                }

                let points = 0;
                let roleNameDisplay = "Nieznana Rola";

                if (roleType === 'neutral') {
                    points = 300;
                    roleNameDisplay = "Neutral";
                } else if (roleType === 'impostor') {
                    points = 200;
                    roleNameDisplay = "Impostor";
                } else if (roleType === 'crewmate') {
                    points = 100;
                    roleNameDisplay = "Crewmate";
                    crewmateWinIncrement++;
                }

                updateWynikRank(userId, points);
                summaryLines.push(`✅ <@${userId}> (${member.displayName}): +${points} pkt (${roleNameDisplay})`);
            }

            if (roleType === 'crewmate' && crewmateWinIncrement > 0) {
                incrementCrewmateWins(crewmateWinIncrement);
                summaryLines.push(`\n📈 Wygrane Crewmate w tej rundzie: ${crewmateWinIncrement}`);
            }

            let finalSummary = `🏆 **Podsumowanie Punktacji (${roleType === 'neutral' ? 'Neutral (+300)' : roleType === 'impostor' ? 'Impostor (+200)' : 'Crewmate (+100)'}):**\n` + summaryLines.join('\n');
            if (summaryLines.length === 0) {
                finalSummary = "Nie wybrano żadnych graczy lub wystąpiły błędy.";
            }

            await i.editReply({ content: finalSummary, components: [], embeds: [] });
            consola.info(`[Points System] Points awarded by ${i.user.tag} for role ${roleType}.`);
            return;
        }


        if (i.isButton() && i.customId.startsWith('queue_')) {
            if (i.customId === 'queue_pull_next') {
                if (!isUserQueueManager(i, i.guild)) {
                    return i.reply({ content: '❌ Nie masz uprawnień do tej akcji.', ephemeral: true });
                }
                if (!queueMessage) {
                    return i.reply({ content: 'Panel kolejki nie jest obecnie aktywny. Użyj `/kolejka start`.', ephemeral: true });
                }

                if (currentQueue.length > 0) {
                    const nextUserId = currentQueue.shift();
                    lastPulledUserIds = [nextUserId];

                    let moveStatusMessage = await attemptMovePlayerToLobby(i, nextUserId, i.guild);
                    await updateQueueMessage(i);
                    return i.reply({ content: `🎣 <@${nextUserId}> został(a) wyciągnięty/a z kolejki! ${moveStatusMessage}`, ephemeral: true });
                } else {
                    return i.reply({ content: 'Kolejka jest pusta, nikogo nie można pociągnąć.', ephemeral: true });
                }
            } else {
                await i.deferUpdate().catch(e => consola.warn("Failed to defer update for queue button:", e.message));
                const userId = i.user.id;
                let replyContent = '';

                if (i.customId === 'queue_join') {
                    if (!queueMessage) {
                        await i.followUp({ content: 'Panel kolejki nie jest obecnie aktywny. Poproś administratora o użycie `/kolejka start`.', ephemeral: true });
                        return;
                    }
                    if (!currentQueue.includes(userId)) {
                        currentQueue.push(userId);
                        replyContent = `<@${userId}> dołączył(a) do kolejki! Twoja pozycja: ${currentQueue.length}.`;
                    } else {
                        replyContent = `<@${userId}> już jesteś w kolejce na pozycji ${currentQueue.indexOf(userId) + 1}.`;
                    }
                } else if (i.customId === 'queue_leave') {
                    if (!queueMessage) {
                        await i.followUp({ content: 'Panel kolejki nie jest obecnie aktywny.', ephemeral: true });
                        return;
                    }
                    const index = currentQueue.indexOf(userId);
                    if (index > -1) {
                        currentQueue.splice(index, 1);
                        replyContent = `<@${userId}> opuścił(a) kolejkę.`;
                    } else {
                        replyContent = `<@${userId}> nie ma Cię w kolejce.`;
                    }
                }
                if (queueMessage) await updateQueueMessage(i);
                if (replyContent) {
                    await i.followUp({ content: replyContent, ephemeral: true });
                }
                return;
            }
        }

        if (i.isButton() && i.customId.startsWith('tempvc_')) {
            const parts = i.customId.split('_');
            const action = parts[1];
            const vcChannelId = parts.pop();

            const channelData = temporaryVoiceChannels.get(vcChannelId);
            if (!channelData || channelData.ownerId !== i.user.id) {
                if (i.message) await i.update({ content: "Ten panel zarządzania nie jest już aktywny.", components: [], embeds: [] }).catch(()=>{});
                else await i.reply({ content: 'Nie jesteś właścicielem tego kanału lub kanał już nie istnieje.', ephemeral: true });
                return;
            }

            const voiceChannel = await i.guild.channels.fetch(vcChannelId).catch(() => null);
            if (!voiceChannel) {
                temporaryVoiceChannels.delete(vcChannelId);
                if (channelData.controlTextChannelId) {
                    const controlTextChannel = await i.guild.channels.fetch(channelData.controlTextChannelId).catch(() => null);
                    if (controlTextChannel) await controlTextChannel.delete('Associated VC deleted').catch(e => consola.error("Error deleting control text channel:", e));
                }
                 if (i.message) await i.update({ content: "Ten kanał głosowy już nie istnieje.", components: [], embeds: [] }).catch(()=>{});
                 else await i.reply({ content: 'Ten kanał głosowy już nie istnieje.', ephemeral: true });
                return;
            }

            let newLockedState = channelData.isLocked;
            let replyEphemeralContent = '✅ Akcja wykonana.';
            let needsPanelUpdate = false;

            if (action === 'lock') {
                await voiceChannel.permissionOverwrites.edit(i.guild.roles.everyone, { Connect: false });
                newLockedState = true;
                replyEphemeralContent = '🔒 Kanał został zablokowany.';
                needsPanelUpdate = true;
            } else if (action === 'unlock') {
                await voiceChannel.permissionOverwrites.edit(i.guild.roles.everyone, { Connect: null });
                newLockedState = false;
                replyEphemeralContent = '🔓 Kanał został odblokowany.';
                needsPanelUpdate = true;
            } else if (action === 'rename' && parts[2] === 'modal') {
                const modal = new ModalBuilder()
                    .setCustomId(`modal_tempvc_rename_${vcChannelId}`)
                    .setTitle('Zmień nazwę kanału VC');
                const nameInput = new TextInputBuilder()
                    .setCustomId('new_vc_name')
                    .setLabel("Nowa nazwa dla kanału głosowego")
                    .setStyle(TextInputStyle.Short)
                    .setValue(voiceChannel.name)
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
                await i.showModal(modal);
                return;
            } else if (action === 'limit' && parts[2] === 'modal') {
                 const modal = new ModalBuilder()
                    .setCustomId(`modal_tempvc_limit_${vcChannelId}`)
                    .setTitle('Ustaw limit użytkowników VC');
                const limitInput = new TextInputBuilder()
                    .setCustomId('new_vc_limit')
                    .setLabel("Nowy limit (0-99, 0=brak)")
                    .setStyle(TextInputStyle.Short)
                    .setValue(voiceChannel.userLimit.toString())
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(limitInput));
                await i.showModal(modal);
                return;
            } else if (action === 'permit' && parts[2] === 'select') {
                const userSelect = new UserSelectMenuBuilder()
                    .setCustomId(`select_tempvc_permit_${vcChannelId}`)
                    .setPlaceholder('Wybierz użytkownika, któremu pozwolić')
                    .setMinValues(1)
                    .setMaxValues(1);
                const row = new ActionRowBuilder().addComponents(userSelect);
                await i.reply({ content: 'Wybierz użytkownika, któremu chcesz pozwolić dołączyć:', components: [row], ephemeral: true });
                return;
            } else if (action === 'reject' && parts[2] === 'select') {
                 const userSelect = new UserSelectMenuBuilder()
                    .setCustomId(`select_tempvc_reject_${vcChannelId}`)
                    .setPlaceholder('Wybierz użytkownika do zablokowania')
                    .setMinValues(1)
                    .setMaxValues(1);
                const row = new ActionRowBuilder().addComponents(userSelect);
                await i.reply({ content: 'Wybierz użytkownika, któremu chcesz zablokować dostęp (i wyrzucić jeśli jest na kanale):', components: [row], ephemeral: true });
                return;
            } else if (action === 'kick' && parts[2] === 'select') {
                const userSelect = new UserSelectMenuBuilder()
                    .setCustomId(`select_tempvc_kick_${vcChannelId}`)
                    .setPlaceholder('Wybierz użytkownika do wyrzucenia')
                    .setMinValues(1)
                    .setMaxValues(1);
                const row = new ActionRowBuilder().addComponents(userSelect);
                await i.reply({ content: 'Wybierz użytkownika do wyrzucenia z kanału:', components: [row], ephemeral: true });
                return;
            }

            if (!['rename', 'limit', 'permit', 'reject', 'kick'].includes(action) ) {
                 await i.reply({ content: replyEphemeralContent, ephemeral: true });
            }


            if (needsPanelUpdate && channelData.panelMessageId && channelData.controlTextChannelId) {
                temporaryVoiceChannels.set(vcChannelId, { ...channelData, isLocked: newLockedState });
                const controlTextChannel = await i.guild.channels.fetch(channelData.controlTextChannelId).catch(() => null);
                if (controlTextChannel) {
                    const panelMessage = await controlTextChannel.messages.fetch(channelData.panelMessageId).catch(() => null);
                    if (panelMessage) {
                        const updatedPanel = await getTempVoiceChannelControlPanelMessage(voiceChannel.name, vcChannelId, newLockedState, client, i.guildId);
                        await panelMessage.edit(updatedPanel);
                    }
                }
            }
            return;
        }

        if (i.isModalSubmit() && i.customId.startsWith('modal_tempvc_')) {
            const parts = i.customId.split('_');
            const action = parts[2];
            const vcChannelId = parts.pop();

            const channelData = temporaryVoiceChannels.get(vcChannelId);
            if (!channelData || channelData.ownerId !== i.user.id) {
                return i.reply({ content: 'Nie jesteś właścicielem tego kanału lub kanał już nie istnieje.', ephemeral: true });
            }
            const voiceChannel = await i.guild.channels.fetch(vcChannelId).catch(() => null);
            if (!voiceChannel) {
                temporaryVoiceChannels.delete(vcChannelId);
                if (channelData.controlTextChannelId) {
                    const controlTextChannel = await i.guild.channels.fetch(channelData.controlTextChannelId).catch(() => null);
                    if (controlTextChannel) await controlTextChannel.delete('Associated VC deleted').catch(e => consola.error("Error deleting control text channel:", e));
                }
                return i.reply({ content: 'Ten kanał głosowy już nie istnieje.', ephemeral: true });
            }

            let replyEphemeral = '✅ Akcja wykonana.';
            let updatePanel = true;

            if (action === 'rename') {
                const newName = i.fields.getTextInputValue('new_vc_name');
                await voiceChannel.setName(newName);
                replyEphemeral = `✅ Nazwa kanału zmieniona na "${newName}".`;
            } else if (action === 'limit') {
                const newLimitRaw = i.fields.getTextInputValue('new_vc_limit');
                const newLimit = parseInt(newLimitRaw);
                if (!isNaN(newLimit) && newLimit >= 0 && newLimit <= 99) {
                    await voiceChannel.setUserLimit(newLimit);
                    replyEphemeral = `✅ Limit użytkowników ustawiony na ${newLimit === 0 ? 'brak limitu' : newLimit}.`;
                } else {
                    replyEphemeral = '❌ Podano nieprawidłowy limit. Wprowadź liczbę od 0 do 99.';
                    updatePanel = false;
                }
            }

            await i.reply({ content: replyEphemeral, ephemeral: true });

            if (updatePanel && channelData.panelMessageId && channelData.controlTextChannelId) {
                const controlTextChannel = await i.guild.channels.fetch(channelData.controlTextChannelId).catch(() => null);
                 if (controlTextChannel) {
                    const panelMessage = await controlTextChannel.messages.fetch(channelData.panelMessageId).catch(() => null);
                    if (panelMessage) {
                        const updatedPanel = await getTempVoiceChannelControlPanelMessage(voiceChannel.name, vcChannelId, channelData.isLocked, client, i.guildId);
                        await panelMessage.edit(updatedPanel);
                    }
                }
            }
            return;
        }

        if (i.isUserSelectMenu() && i.customId.startsWith('select_tempvc_')) {
            const parts = i.customId.split('_');
            const action = parts[2];
            const vcChannelId = parts.pop();
            const selectedUserId = i.values[0];
            const targetUser = await i.guild.members.fetch(selectedUserId);

            const channelData = temporaryVoiceChannels.get(vcChannelId);
            if (!channelData || channelData.ownerId !== i.user.id) {
                return i.reply({ content: 'Nie jesteś właścicielem tego kanału lub kanał już nie istnieje.', ephemeral: true });
            }
            const voiceChannel = await i.guild.channels.fetch(vcChannelId).catch(() => null);
            if (!voiceChannel) {
                temporaryVoiceChannels.delete(vcChannelId);
                 if (channelData.controlTextChannelId) {
                    const controlTextChannel = await i.guild.channels.fetch(channelData.controlTextChannelId).catch(() => null);
                    if (controlTextChannel) await controlTextChannel.delete('Associated VC deleted').catch(e => consola.error("Error deleting control text channel:", e));
                }
                return i.reply({ content: 'Ten kanał głosowy już nie istnieje.', ephemeral: true });
            }

            let replyEphemeral = `✅ Akcja wykonana dla ${targetUser.user.tag}.`;

            if (action === 'permit') {
                await voiceChannel.permissionOverwrites.edit(targetUser.id, { Connect: true, ViewChannel: true });
                replyEphemeral = `✅ Użytkownik ${targetUser} może teraz dołączyć do Twojego kanału.`;
            } else if (action === 'reject') {
                await voiceChannel.permissionOverwrites.edit(targetUser.id, { Connect: false, ViewChannel: false });
                if (targetUser.voice.channelId === voiceChannel.id) {
                    await targetUser.voice.disconnect('Zablokowany przez właściciela kanału').catch(e => consola.warn("Failed to disconnect user on reject:", e.message));
                }
                replyEphemeral = `🚫 Użytkownik ${targetUser} został zablokowany i wyrzucony z kanału (jeśli był).`;
            } else if (action === 'kick') {
                 if (targetUser.voice.channelId === voiceChannel.id) {
                    if (targetUser.id === i.user.id) { // Owner tries to kick self
                        replyEphemeral = 'Nie możesz wyrzucić samego siebie.';
                    } else {
                        await targetUser.voice.disconnect('Wyrzucony przez właściciela kanału');
                        replyEphemeral = `👟 Użytkownik ${targetUser} został wyrzucony z kanału.`;
                    }
                } else {
                    replyEphemeral = `❌ Użytkownik ${targetUser} nie znajduje się na Twoim kanale.`;
                }
            }
            await i.update({ content: replyEphemeral, components: [] });
            return;
        }


        if (!i.isChatInputCommand()) return;
        const commandName = i.commandName;
        const subcommandName = i.options.getSubcommand(false);

        consola.info(`Command: /${commandName}${subcommandName ? ' ' + subcommandName : ''} by ${i.user.tag} (ID: ${i.user.id}) in channel ${i.channel.name} (ID: ${i.channel.id})`);

        if (commandName === 'ankieta') {
            if (subcommandName === 'start') {
                if (!isUserAdmin(i, i.guild)) return i.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });
                return manualStartPoll(i);
            } else if (subcommandName === 'zakoncz') {
                if (!isUserAdmin(i, i.guild)) return i.reply({ content: '❌ Nie masz uprawnień.', ephemeral: true });
                if (!voteMessage) return i.reply({ content: '❌ Brak aktywnej ankiety do zakończenia.', ephemeral: true });
                await i.deferReply({ ephemeral: true });
                const res = await endVoting(voteMessage, votes, true);
                if (res) {
                    voteMessage = null;
                    return i.editReply('✅ Ankieta zakończona.');
                }
                return i.editReply('❌ Nie udało się zakończyć ankiety.');
            }
        } else if (commandName === 'kolejka') {
            if (!isUserQueueManager(i, i.guild)) {
                return i.reply({ content: '❌ Nie masz uprawnień do zarządzania kolejką.', ephemeral: true });
            }
            if (subcommandName === 'start') {
                const queueChannelId = QUEUE_CHANNEL_ID || DEFAULT_QUEUE_CHANNEL_ID;
                if(!queueChannelId) {
                    return i.reply({ content: `❌ Kanał kolejki nie jest skonfigurowany. Ustaw QUEUE_CHANNEL_ID.`, ephemeral: true });
                }
                const queueChannel = await client.channels.fetch(queueChannelId);
                if (!queueChannel) return i.reply({ content: `❌ Nie znaleziono kanału kolejki (ID: ${queueChannelId}). Sprawdź konfigurację.`, ephemeral: true });

                const oldQueueMsgId = loadQueueMessageId();
                if (oldQueueMsgId) {
                    try {
                        const oldMsg = await queueChannel.messages.fetch(oldQueueMsgId);
                        await oldMsg.delete();
                        consola.info(`Usunięto starą wiadomość kolejki (ID: ${oldQueueMsgId})`);
                    } catch (err) {
                        consola.warn(`Nie udało się usunąć starej wiadomości kolejki (ID: ${oldQueueMsgId}) lub nie została znaleziona: ${err.message}`);
                    }
                }
                saveQueueMessageId('');
                queueMessage = null;
                currentQueue = [];
                isLobbyLocked = false;
                lastPulledUserIds = [];
                const canManageQueue = isUserQueueManager(i, i.guild);
                try {
                    queueMessage = await queueChannel.send({ embeds: [getQueueEmbed()], components: [getQueueActionRow(canManageQueue)] });
                    saveQueueMessageId(queueMessage.id);
                    await i.reply({ content: `✅ Panel kolejki został uruchomiony w kanale <#${queueChannelId}>. Lobby jest odblokowane.`, ephemeral: true });
                } catch (sendError) {
                    consola.error('Nie udało się wysłać nowej wiadomości panelu kolejki:', sendError);
                    await i.reply({ content: '❌ Wystąpił błąd podczas tworzenia panelu kolejki.', ephemeral: true });
                }
            } else if (subcommandName === 'dodaj') {
                if (!queueMessage) return i.reply({ content: 'Panel kolejki nie jest aktywny. Użyj `/kolejka start` najpierw.', ephemeral: true });
                const userToAdd = i.options.getUser('uzytkownik');
                if (currentQueue.includes(userToAdd.id)) return i.reply({ content: `<@${userToAdd.id}> jest już w kolejce.`, ephemeral: true });
                currentQueue.push(userToAdd.id);
                await updateQueueMessage(i);
                return i.reply({ content: `✅ Dodano <@${userToAdd.id}> na koniec kolejki.`, ephemeral: true });
            } else if (subcommandName === 'pozycja') {
                if (!queueMessage) return i.reply({ content: 'Panel kolejki nie jest aktywny. Użyj `/kolejka start` najpierw.', ephemeral: true });
                const userToPosition = i.options.getUser('uzytkownik');
                const desiredPosition = i.options.getInteger('wartosc');
                if (desiredPosition <= 0) return i.reply({ content: '❌ Pozycja musi być liczbą dodatnią.', ephemeral: true });
                const existingIndex = currentQueue.indexOf(userToPosition.id);
                if (existingIndex > -1) currentQueue.splice(existingIndex, 1);
                const targetIndex = desiredPosition - 1;
                if (targetIndex >= currentQueue.length) {
                    currentQueue.push(userToPosition.id);
                    await updateQueueMessage(i);
                    return i.reply({ content: `✅ <@${userToPosition.id}> został dodany na koniec kolejki (pozycja ${currentQueue.length}).`, ephemeral: true });
                } else {
                    currentQueue.splice(targetIndex, 0, userToPosition.id);
                    await updateQueueMessage(i);
                    return i.reply({ content: `✅ <@${userToPosition.id}> został ustawiony na pozycji ${desiredPosition}.`, ephemeral: true });
                }
            } else if (subcommandName === 'pull') {
                if (!queueMessage) return i.reply({ content: 'Panel kolejki nie jest obecnie aktywny. Użyj `/kolejka start`.', ephemeral: true });
                const liczba = i.options.getInteger('liczba') || 1;
                if (currentQueue.length === 0) return i.reply({ content: 'Kolejka jest pusta!', ephemeral: true });

                await i.deferReply({ ephemeral: true });
                const pulledUsersInfo = [];
                let overallMoveStatusMessage = "\n**Status przenoszenia:**\n";
                const currentPulledIdsThisCommand = [];

                for (let k = 0; k < liczba && currentQueue.length > 0; k++) {
                    const userId = currentQueue.shift();
                    pulledUsersInfo.push(`<@${userId}>`);
                    currentPulledIdsThisCommand.push(userId);
                    const moveStatus = await attemptMovePlayerToLobby(i, userId, i.guild);
                    overallMoveStatusMessage += `${moveStatus.startsWith('Gracz') ? '' : `<@${userId}>: `}${moveStatus}\n`;
                }
                lastPulledUserIds = [...currentPulledIdsThisCommand];
                await updateQueueMessage(i);
                const pulledMentions = pulledUsersInfo.join(', ');
                await i.editReply({ content: `🎣 Następujące osoby (${pulledUsersInfo.length}) zostały pociągnięte z kolejki: ${pulledMentions}. ${overallMoveStatusMessage}`});
            } else if (subcommandName === 'pull_user') {
                 if (!queueMessage) return i.reply({ content: 'Panel kolejki nie jest aktywny. Użyj `/kolejka start` najpierw.', ephemeral: true });
                const targetUser = i.options.getUser('uzytkownik');
                if (!targetUser) return i.reply({ content: '❌ Musisz wskazać użytkownika.', ephemeral: true });

                const userIndex = currentQueue.indexOf(targetUser.id);
                if (userIndex === -1) return i.reply({ content: `<@${targetUser.id}> nie znajduje się w kolejce.`, ephemeral: true });

                await i.deferReply({ ephemeral: true });
                currentQueue.splice(userIndex, 1);
                lastPulledUserIds = [targetUser.id];
                const moveStatus = await attemptMovePlayerToLobby(i, targetUser.id, i.guild);
                await updateQueueMessage(i);
                await i.editReply({ content: `🎣 Pociągnięto <@${targetUser.id}> z kolejki! ${moveStatus}` });
            } else if (subcommandName === 'wyczysc') {
                if (!queueMessage) return i.reply({ content: 'Panel kolejki nie jest obecnie aktywny. Użyj `/kolejka start`.', ephemeral: true });
                currentQueue = [];
                lastPulledUserIds = [];
                await updateQueueMessage(i);
                return i.reply({ content: '✅ Kolejka została wyczyszczona.', ephemeral: true });
            }
        } else if (commandName === 'ranking') {
            if (subcommandName === 'among') {
                const fullRankingText = getWynikRanking(false, null, true);
                const embed = new EmbedBuilder()
                    .setTitle('🏆 Pełny Ranking Punktów "Among" 🏆')
                    .setDescription(fullRankingText.length > 4096 ? fullRankingText.substring(0, 4093) + "..." : fullRankingText)
                    .setColor(0xDAA520)
                    .setTimestamp();
                await i.reply({ embeds: [embed] });
            } else if (subcommandName === 'aktualizuj_z_api') {
                if (!isUserAdmin(i, i.guild)) {
                    return i.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });
                }
                if (!AMONG_GAMES_API_URL || !AMONG_GAMES_API_TOKEN || !AMONG_GAMES_API_SECRET) {
                    return i.reply({ content: '❌ Funkcja API nie jest skonfigurowana (brak URL, tokenu lub sekretu).', ephemeral: true });
                }
                await i.deferReply({ ephemeral: true });
                consola.info(`[Command /ranking aktualizuj_z_api] Triggered by ${i.user.tag}`);
                const today = new Date().toISOString().slice(0, 10);
                const gameResults = await fetchGameResultsFromApi(today);
                await processGameResultsAndAwardPoints(gameResults, i, client);
            } else {
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
        } else if (commandName === 'win') {
            if (!isUserAdmin(i, i.guild)) {
                return i.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });
            }
            const embed = new EmbedBuilder()
                .setTitle('🏆 Przyznawanie Punktów "Psychopaci"')
                .setDescription('Krok 1: Wybierz rolę, za którą chcesz przyznać punkty.')
                .setColor(0x2ECC71);
            const roleButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('points_role_neutral').setLabel('Neutral (+300 pkt)').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('points_role_impostor').setLabel('Impostor (+200 pkt)').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('points_role_crewmate').setLabel('Crewmate (+100 pkt)').setStyle(ButtonStyle.Success)
                );
            await i.reply({ embeds: [embed], components: [roleButtons], ephemeral: true });
        } else if (commandName === 'reload') {
            if (!isUserAdmin(i, i.guild)) return i.reply({ content: '❌ No permission.', ephemeral: true });
            await i.deferReply({ ephemeral: true });
            await registerCommands();
            return i.editReply('✅ Commands reloaded.');
        } else if (commandName === 'ktosus') {
             if (!isUserQueueManager(i, i.guild)) {
                return i.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });
            }
            if (!i.guild) return i.reply({ content: 'Tej komendy można użyć tylko na serwerze.', ephemeral: true});

            const cooldowns = loadJSON(KTOSUS_COOLDOWNS_FILE, {});
            const now = Date.now();
            const userCooldown = cooldowns[i.user.id];

            if (userCooldown && (now - userCooldown < KTOSUS_COOLDOWN_DURATION) && i.user.id !== OWNER_ID) {
                const timeLeft = Math.ceil((KTOSUS_COOLDOWN_DURATION - (now - userCooldown)) / (1000 * 60 * 60));
                return i.reply({ content: `Musisz poczekać jeszcze około ${timeLeft}h, zanim znowu użyjesz tej komendy.`, ephemeral: true });
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
        } else {
             consola.warn(`Unknown command /${commandName} attempted by ${i.user.tag}`);
             await i.reply({ content: 'Nieznana komenda.', ephemeral: true });
        }
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
    consola.info(`[voiceStateUpdate] Triggered. Old channel: ${oldState.channelId}, New channel: ${newState.channelId}, User: ${newState.member?.user.tag}`);

    const guild = newState.guild || oldState.guild;
    if (!guild) return;

    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    if (MONITORED_VC_ID && LOG_TEXT_CHANNEL_ID) {
        try {
            const monitoredChannel = await guild.channels.fetch(MONITORED_VC_ID).catch(() => {
                consola.warn(`[VC Log] Monitored VC ID (${MONITORED_VC_ID}) not found or invalid.`);
                return null;
            });
            const logChannel = await guild.channels.fetch(LOG_TEXT_CHANNEL_ID).catch(() => {
                consola.warn(`[VC Log] Log Text Channel ID (${LOG_TEXT_CHANNEL_ID}) not found or invalid.`);
                return null;
            });

            if (logChannel && logChannel.isTextBased() && monitoredChannel && monitoredChannel.type === ChannelType.GuildVoice) {
                const time = new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const userTag = member.user.tag;
                const userId = member.id;
                const userAvatar = member.user.displayAvatarURL({ dynamic: true });

                if (newState.channelId === MONITORED_VC_ID && oldState.channelId !== MONITORED_VC_ID) {
                    monitoredVcSessionJoins.set(userId, Date.now());
                    consola.debug(`[VC Log] User ${userTag} joined monitored VC. Stored join time.`);
                    const joinEmbed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setAuthor({ name: `${userTag} (${userId})`, iconURL: userAvatar })
                        .setDescription(`➡️ <@${userId}> **dołączył/a** do kanału głosowego <#${MONITORED_VC_ID}> (${monitoredChannel.name})`)
                        .setTimestamp()
                        .setFooter({text: `Log Wejścia`});
                    await logChannel.send({ embeds: [joinEmbed] }).catch(e => consola.error("Error sending join log:", e));
                }
                else if (oldState.channelId === MONITORED_VC_ID && newState.channelId !== MONITORED_VC_ID) {
                    const joinTimestamp = monitoredVcSessionJoins.get(userId);
                    let durationString = "Nieznany (bot mógł być zrestartowany lub użytkownik był już na kanale przy starcie bota)";
                    if (joinTimestamp) {
                        const durationMs = Date.now() - joinTimestamp;
                        durationString = formatDuration(durationMs);
                        monitoredVcSessionJoins.delete(userId);
                        consola.debug(`[VC Log] User ${userTag} left monitored VC. Calculated duration: ${durationString}`);
                    } else {
                        consola.warn(`[VC Log] User ${userTag} left monitored VC, but no join timestamp was found.`);
                    }
                    const leaveEmbed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setAuthor({ name: `${userTag} (${userId})`, iconURL: userAvatar })
                        .setDescription(`⬅️ <@${userId}> **opuścił/a** kanał głosowego <#${MONITORED_VC_ID}> (${monitoredChannel.name})`)
                        .addFields({ name: 'Czas spędzony na kanale', value: durationString, inline: false })
                        .setTimestamp()
                        .setFooter({text: `Log Wyjścia`});
                    await logChannel.send({ embeds: [leaveEmbed] }).catch(e => consola.error("Error sending leave log:", e));
                }
            }
        } catch (error) {
            consola.error("[VC Log] Error processing voice state update for logging:", error);
        }
    }

    if (WELCOME_DM_VC_ID && newState.channelId === WELCOME_DM_VC_ID && oldState.channelId !== WELCOME_DM_VC_ID) {
        consola.info(`User ${member.user.tag} joined WELCOME_DM_VC_ID (${WELCOME_DM_VC_ID}).`);
        const welcomeDmSentUsers = loadJSON(WELCOME_DM_SENT_USERS_FILE, {});
        if (!welcomeDmSentUsers[member.id]) {
            consola.info(`Attempting to send welcome DM to ${member.user.tag} (first time join).`);
            try {
                const welcomeMessage = `🎤 **NOWY CREWMATE U PSYCHOPATÓW!** 🎤\n\nSuper, że do nas dołączyłeś!\n\n📌 Jesteśmy ludźmi z zasadami, więc zerknij na <#1346785475729559623>\n📚 Nie grałeś wcześniej na modach? Zajrzyj tutaj: <#1374085202933977240>\n\nZnajdziesz tutaj spis najważniejszych informacji.`;
                await member.send(welcomeMessage);
                consola.info(`Sent welcome DM to ${member.user.tag}`);
                welcomeDmSentUsers[member.id] = true;
                saveJSON(WELCOME_DM_SENT_USERS_FILE, welcomeDmSentUsers);
            } catch (dmError) {
                consola.warn(`Could not send welcome DM to ${member.user.tag}. They might have DMs disabled. Error: ${dmError.message}`);
            }
        } else {
            consola.info(`User ${member.user.tag} has already received the welcome DM for this channel.`);
        }
    }


    const gameLobbyChannel = GAME_LOBBY_VOICE_CHANNEL_ID ? await guild.channels.fetch(GAME_LOBBY_VOICE_CHANNEL_ID).catch(() => null) : null;
    const waitingRoomChannel = WAITING_ROOM_VOICE_CHANNEL_ID ? await guild.channels.fetch(WAITING_ROOM_VOICE_CHANNEL_ID).catch(() => null) : null;

    const creatorChannelId = VOICE_CREATOR_CHANNEL_ID;
    const tempVcCategoryId = TEMP_CHANNEL_CATEGORY_ID;
    const tempVcControlPanelCategoryId = TEMP_VC_CONTROL_PANEL_CATEGORY_ID;

    if (creatorChannelId && tempVcCategoryId && tempVcControlPanelCategoryId && newState.channelId === creatorChannelId && newState.channelId !== oldState.channelId) {
        consola.info(`User ${member.user.tag} joined voice creator channel (ID: ${creatorChannelId})`);
        const tempVcCategory = await guild.channels.fetch(tempVcCategoryId).catch(()=>null);
        const controlPanelCategory = await guild.channels.fetch(tempVcControlPanelCategoryId).catch(()=>null);


        if (!tempVcCategory || tempVcCategory.type !== ChannelType.GuildCategory) {
            consola.error(`Temporary voice channel category (ID: ${tempVcCategoryId}) not found or is not a category.`);
            if (newState.channel) await newState.setChannel(null).catch(e => consola.error("Failed to move user out of creator channel:", e));
            return;
        }
        if (!controlPanelCategory || controlPanelCategory.type !== ChannelType.GuildCategory) {
            consola.error(`Temporary VC control panel category (ID: ${tempVcControlPanelCategoryId}) not found or is not a category.`);
            if (newState.channel) await newState.setChannel(null).catch(e => consola.error("Failed to move user out of creator channel:", e));
            return;
        }

        try {
            const vcName = `Pokój ${member.displayName}`;
            const newVc = await guild.channels.create({
                name: vcName,
                type: ChannelType.GuildVoice,
                parent: tempVcCategoryId,
                permissionOverwrites: [
                    {
                        id: member.id,
                        allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers, PermissionsBitField.Flags.MuteMembers, PermissionsBitField.Flags.DeafenMembers, PermissionsBitField.Flags.PrioritySpeaker, PermissionsBitField.Flags.Stream, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect],
                        type: OverwriteType.Member
                    },
                    {
                        id: guild.roles.everyone,
                        allow: [PermissionsBitField.Flags.Connect],
                        type: OverwriteType.Role
                    }
                ],
            });
            consola.info(`Created temporary VC "${vcName}" (ID: ${newVc.id}) for ${member.user.tag}. Owner: ${member.id}`);

            let creatorNameForChannel = member.displayName.toLowerCase().replace(/\s+/g, '-');
            creatorNameForChannel = creatorNameForChannel.replace(/[^a-z0-9-]/g, '');
            if (creatorNameForChannel.length > 25) creatorNameForChannel = creatorNameForChannel.substring(0, 25);
            if (creatorNameForChannel.length === 0) creatorNameForChannel = 'uzytkownika';
            const controlTextChannelName = `Panel-${creatorNameForChannel}`;

            const controlTextChannel = await guild.channels.create({
                name: controlTextChannelName,
                type: ChannelType.GuildText,
                parent: tempVcControlPanelCategoryId,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone,
                        deny: [PermissionsBitField.Flags.ViewChannel],
                    },
                    {
                        id: member.id,
                        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
                    },
                    {
                        id: client.user.id,
                        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ManageChannels],
                    }
                ]
            });
            consola.info(`Created control text channel "${controlTextChannelName}" (ID: ${controlTextChannel.id}) for VC ${newVc.id}`);

            await member.voice.setChannel(newVc);

            const controlPanelMessageContent = await getTempVoiceChannelControlPanelMessage(newVc.name, newVc.id, false, client, guild.id);
            consola.info(`[Temp VC] Attempting to send control panel to #${controlTextChannel.name}. Content:`, JSON.stringify(controlPanelMessageContent, null, 2));
            const panelMessage = await controlTextChannel.send(controlPanelMessageContent);
            consola.info(`[Temp VC] Control panel message sent with ID: ${panelMessage.id}. Components length: ${panelMessage.components?.length}`);


            temporaryVoiceChannels.set(newVc.id, {
                ownerId: member.id,
                vcId: newVc.id,
                controlTextChannelId: controlTextChannel.id,
                panelMessageId: panelMessage.id,
                isLocked: false
            });

        } catch (error) {
            consola.error(`Failed to create or manage temporary voice channel for ${member.user.tag}:`, error);
             try {
                await member.send("Przepraszamy, wystąpił błąd podczas tworzenia Twojego kanału tymczasowego. Spróbuj ponownie później lub skontaktuj się z administratorem.").catch(() => {});
            } catch (e) { consola.warn("Failed to send DM about temp channel creation error after initial error.");}

            if (newState.channelId === creatorChannelId) {
                await member.voice.setChannel(null).catch(e => consola.error("Failed to move user out of creator after error:", e));
            }
        }
        return;
    }

    if (oldState.channelId && temporaryVoiceChannels.has(oldState.channelId)) {
        const oldVc = await guild.channels.fetch(oldState.channelId).catch(() => null);
        if (oldVc && oldVc.members.filter(m => !m.user.bot).size === 0) {
            const channelData = temporaryVoiceChannels.get(oldState.channelId);
            consola.info(`Temporary VC (ID: ${oldState.channelId}) is empty. Deleting...`);
            try {
                await oldVc.delete('Temporary voice channel empty');
                consola.info(`Deleted empty temporary VC (ID: ${oldState.channelId})`);

                if (channelData.controlTextChannelId) {
                    const controlTextChannel = await guild.channels.fetch(channelData.controlTextChannelId).catch(() => null);
                    if (controlTextChannel) {
                        await controlTextChannel.delete('Associated VC deleted').catch(e => consola.error("Error deleting control text channel:", e));
                        consola.info(`Deleted control text channel (ID: ${channelData.controlTextChannelId})`);
                    }
                }
                temporaryVoiceChannels.delete(oldState.channelId);
            } catch (error) {
                consola.error(`Failed to delete temporary voice channel or its control channel (VC ID: ${oldState.channelId}):`, error);
            }
        }
    }


    if (GAME_LOBBY_VOICE_CHANNEL_ID && WAITING_ROOM_VOICE_CHANNEL_ID && gameLobbyChannel && waitingRoomChannel) {
        const lobbyMemberCount = gameLobbyChannel.members.filter(m => !m.user.bot).size;
        const previousLobbyLockedStatus = isLobbyLocked;

        isLobbyLocked = (currentQueue.length > 0 || lobbyMemberCount >= 18);

        if (isLobbyLocked !== previousLobbyLockedStatus && queueMessage) {
            consola.info(`Lobby lock status changed to: ${isLobbyLocked}. Queue length: ${currentQueue.length}, Lobby members: ${lobbyMemberCount}. Updating queue panel.`);
            const pseudoInteractionUser = { id: client.user.id, user: client.user };
            const pseudoInteraction = { guild: guild, user: pseudoInteractionUser, channel: queueMessage.channel };
            await updateQueueMessage(pseudoInteraction);
        }

        if (newState.channelId === GAME_LOBBY_VOICE_CHANNEL_ID && oldState.channelId !== GAME_LOBBY_VOICE_CHANNEL_ID) {
            consola.info(`User ${member.user.tag} joined game lobby (ID: ${GAME_LOBBY_VOICE_CHANNEL_ID}). Current non-bot members: ${lobbyMemberCount}. Lobby locked: ${isLobbyLocked}`);

            if (isLobbyLocked) {
                if (isUserAdmin({user: member.user}, guild)) {
                    consola.info(`Admin/Leader ${member.user.tag} joined locked lobby. Allowing.`);
                    return;
                }
                const wasPulledIndex = lastPulledUserIds.indexOf(member.id);
                if (wasPulledIndex !== -1) {
                    consola.info(`User ${member.user.tag} was pulled from queue. Allowing to join locked lobby.`);
                    lastPulledUserIds.splice(wasPulledIndex, 1);
                    return;
                }

                consola.info(`User ${member.user.tag} tried to join locked lobby without permission. Moving to waiting room.`);
                try {
                    await member.voice.setChannel(waitingRoomChannel);
                } catch (moveError) {
                    consola.error(`Nie udało się przenieść ${member.user.tag} do poczekalni: ${moveError}`);
                }
            }
        }
    }
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
