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

const KTOSUS_COOLDOWN_DURATION = 24 * 60 * 60 * 1000; // 24 godziny w milisekundach
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

    // Grupa komend /ankieta
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

    // Grupa komend /kolejka
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

    // Grupa komend /ranking
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

    // Komenda /win
    cmds.push(
        new SlashCommandBuilder()
            .setName('win')
            .setDescription('Rozpocznij proces przyznawania punktów za role po grze (admin).')
            .toJSON()
    );

    // Komenda /ktosus
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
            requestUrl += `&dzien=${date}`; // Format YYYY-MM-DD
        }

        consola.info(`[API Fetch] Fetching games from API. URL (secret redacted): ${requestUrl.replace(AMONG_GAMES_API_SECRET, '******')}`);
        const response = await axios.get(requestUrl);

        if (response.data && response.data.success && Array.isArray(response.data.games)) {
            consola.info(`[API Fetch] Successfully fetched ${response.data.count} games.`);
            return response.data.games;
        } else {
            consola.warn('[API Fetch] API response was not successful or data format is unexpected:', response.data);
            return [];
        }
    } catch (error) {
        consola.error('[API Fetch] Error fetching game results:', error.message);
        if (error.response) {
            consola.error('[API Fetch] Error response data:', error.response.data);
            consola.error('[API Fetch] Error response status:', error.response.status);
        }
        return null;
    }
}

async function processGameResultsAndAwardPoints(gamesToProcess, interaction = null) {
    if (!gamesToProcess || gamesToProcess.length === 0) {
        consola.info('[Process Results] No new games to process from API.');
        if (interaction) await interaction.editReply({ content: 'ℹ️ Brak nowych gier do przetworzenia z API.' }).catch(e => consola.error("Error editing reply for no games:", e));
        return 0;
    }

    const processedGameIds = loadJSON(PROCESSED_GAME_IDS_FILE, []);
    let newGamesProcessedCount = 0;
    let pointsAwardedMessages = []; // Zbiera informacje o przyznanych punktach dla odpowiedzi

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
            if (game.winningTeam && game.winningTeam.toLowerCase() === "crewmates" && !game.winningTeam.toLowerCase().includes("lover")) {
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
                if (replyMessage.length > 1900) { // Discord character limit for messages is 2000
                    replyMessage = replyMessage.substring(0, 1900) + "\n... (więcej informacji w logach konsoli)";
                }
            } else {
                replyMessage += "\nNie przyznano żadnych nowych punktów w tych grach na podstawie obecnych zasad lub gry zostały już wcześniej przetworzone.";
            }
            await interaction.editReply({ content: replyMessage }).catch(e => consola.error("Error editing reply for processed games:", e));
        } else {
            await interaction.editReply({ content: 'ℹ️ Brak nowych gier do przetworzenia z API (mogły zostać już wcześniej przetworzone).'}).catch(e => consola.error("Error editing reply for no new games:", e));
        }
    } else if (newGamesProcessedCount > 0 && pointsAwardedMessages.length > 0 && PANEL_CHANNEL_ID) { // Automatyczne powiadomienie
        try {
            const summaryChannel = await client.channels.fetch(PANEL_CHANNEL_ID); // Możesz użyć innego kanału
            if(summaryChannel && summaryChannel.isTextBased()){
                let autoUpdateMessage = `🤖 Automatycznie przetworzono ${newGamesProcessedCount} gier z API.`;
                 if (pointsAwardedMessages.length > 0) {
                    autoUpdateMessage += "\n**Przyznane punkty:**" + pointsAwardedMessages.join('\n');
                     if (autoUpdateMessage.length > 1900) { // Discord character limit
                        autoUpdateMessage = autoUpdateMessage.substring(0, 1900) + "\n... (więcej informacji w logach konsoli)";
                    }
                }
                await summaryChannel.send(autoUpdateMessage);
                consola.info(`[API Auto-Update] Sent summary message to channel ${summaryChannel.name}.`);
            }
        } catch (e) {
            consola.error("[API Auto-Update] Failed to send summary message:", e);
        }
    }


    // Odświeżenie panelu rankingu, jeśli były zmiany
    if (newGamesProcessedCount > 0 && PANEL_CHANNEL_ID) {
        const panelCh = await client.channels.fetch(PANEL_CHANNEL_ID || DEFAULT_PANEL_CHANNEL_ID).catch(() => null);
        const panelMessageId = loadPanelMessageId();
        if (panelCh && panelMessageId) {
            try {
                const panelMsgToEdit = await panelCh.messages.fetch(panelMessageId);
                const guild = await client.guilds.fetch(GUILD_ID);
                await panelMsgToEdit.edit({ embeds: [getPanelEmbed(guild)], components: [getPanelRow()] });
                consola.info("[API Process] Ranking panel updated after processing API games.");
            } catch (e) {
                consola.error("[API Process] Failed to update ranking panel after API processing:", e);
            }
        }
    }
    return newGamesProcessedCount;
}

// --- Pozostałe funkcje bez zmian ---
// ... (getPanelEmbed, getPanelRow, determineWinnerDescriptionForMainEmbed, buildPollEmbeds, endVoting)
// ... (isUserAdmin, isUserQueueManager, attemptMovePlayerToLobby, getQueueEmbed, getQueueActionRow, updateQueueMessage)
// ... (getTempVoiceChannelControlPanelMessage, manualStartPoll)

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMembers] });
consola.success('[INIT] Client object has been defined.'); // Dodany log

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

    // Automatyczne pobieranie i przetwarzanie wyników gier co 2 minuty
    if (AMONG_GAMES_API_URL && AMONG_GAMES_API_TOKEN && AMONG_GAMES_API_SECRET) {
        schedule.scheduleJob('*/2 * * * *', async () => { // Zmieniono na co 2 minuty
            consola.info('[Scheduled Task - API] Fetching game results every 2 minutes...');
            const today = new Date().toISOString().slice(0, 10); // Format YYYY-MM-DD
            const gameResults = await fetchGameResultsFromApi(today);
            if (gameResults) {
                await processGameResultsAndAwardPoints(gameResults, null); // Przekazujemy null jako interaction
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
        // ... (reszta logów interakcji)


        if (i.isButton()) {
            // ... (logika przycisków bez zmian)
        }

        if (i.isStringSelectMenu() && i.customId === 'poll_select_time_for_voters') {
            // ... (bez zmian)
        }


        if (i.isButton() && i.customId.startsWith('points_role_')) {
            // ... (bez zmian)
        }

        if (i.isUserSelectMenu() && i.customId.startsWith('points_user_select_')) {
           // ... (bez zmian)
        }


        if (i.isButton() && i.customId.startsWith('queue_')) {
            // ... (bez zmian)
        }

        if (i.isButton() && i.customId.startsWith('tempvc_')) {
            // ... (bez zmian)
        }

        if (i.isModalSubmit() && i.customId.startsWith('modal_tempvc_')) {
           // ... (bez zmian)
        }

        if (i.isUserSelectMenu() && i.customId.startsWith('select_tempvc_')) {
           // ... (bez zmian)
        }


        if (!i.isChatInputCommand()) return;
        const commandName = i.commandName;
        const subcommandName = i.options.getSubcommand(false);

        consola.info(`Command: /${commandName}${subcommandName ? ' ' + subcommandName : ''} by ${i.user.tag} (ID: ${i.user.id}) in channel ${i.channel.name} (ID: ${i.channel.id})`);

        if (commandName === 'ankieta') {
            // ... (bez zmian)
        } else if (commandName === 'kolejka') {
            if (!isUserQueueManager(i, i.guild)) {
                return i.reply({ content: '❌ Nie masz uprawnień do zarządzania kolejką.', ephemeral: true });
            }
            if (subcommandName === 'start') {
                // ... (bez zmian)
            } else if (subcommandName === 'dodaj') {
                // ... (bez zmian)
            } else if (subcommandName === 'pozycja') {
                // ... (bez zmian)
            } else if (subcommandName === 'pull') { // Zmieniono z 'pociagnij_gracza' na 'pull'
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
                // ... (bez zmian)
            }
        } else if (commandName === 'ranking') {
            if (subcommandName === 'among') {
                // ... (bez zmian, wyświetla publicznie)
            } else if (subcommandName === 'aktualizuj_z_api') { // Obsługa nowej subkomendy
                if (!isUserAdmin(i, i.guild)) {
                    return i.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });
                }
                if (!AMONG_GAMES_API_URL || !AMONG_GAMES_API_TOKEN || !AMONG_GAMES_API_SECRET) {
                    return i.reply({ content: '❌ Funkcja API nie jest skonfigurowana (brak URL, tokenu lub sekretu).', ephemeral: true });
                }
                await i.deferReply({ ephemeral: true });
                consola.info(`[Command /ranking aktualizuj_z_api] Triggered by ${i.user.tag}`);
                const today = new Date().toISOString().slice(0, 10);
                const gameResults = await fetchGameResultsFromApi(today); // Pobierz gry tylko z dzisiaj
                await processGameResultsAndAwardPoints(gameResults, i); // Przekaż interakcję do odpowiedzi
            } else {
                if (!isUserAdmin(i, i.guild)) {
                    return i.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });
                }
                if (subcommandName === 'dodaj') {
                    // ... (bez zmian)
                } else if (subcommandName === 'usun') {
                    // ... (bez zmian)
                } else if (subcommandName === 'clear') {
                    // ... (bez zmian)
                }
            }
        } else if (commandName === 'win') {
            // ... (bez zmian)
        } else if (commandName === 'reload') {
            // ... (bez zmian)
        } else if (commandName === 'ktosus') {
             if (!isUserQueueManager(i, i.guild)) { // Zmieniono na isUserQueueManager
                return i.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });
            }
            // ... (reszta logiki ktosus bez zmian)
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
