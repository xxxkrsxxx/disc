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
// const cheerio = require('cheerio'); // Usunięte, bo DOC_URL nie jest już używane
const consola = require('consola');
const schedule = require('node-schedule');
// const crypto = require('crypto'); // Usunięte, bo DOC_URL nie jest już używane

// --- ENV VALIDATION ---
const {
    DISCORD_TOKEN,
    CLIENT_ID,
    OWNER_ID,
    CHANNEL_ID,  // Kanał dla ankiet
    ROLE_ID,     // Rola pingowana przy ankietach
    // DOC_URL, // Usunięte
    GUILD_ID,    // Kluczowe dla działania na jednym serwerze
    LEADER_ROLE_ID, 
    PANEL_CHANNEL_ID, 
    QUEUE_CHANNEL_ID, 
    GAME_LOBBY_VOICE_CHANNEL_ID,
    WAITING_ROOM_VOICE_CHANNEL_ID,
    VOICE_CREATOR_CHANNEL_ID, 
    TEMP_CHANNEL_CATEGORY_ID, 
    MVP_ROLE_ID,
    TEMP_VC_CONTROL_PANEL_CATEGORY_ID,
    MONITORED_VC_ID, // NOWA ZMIENNA
    LOG_TEXT_CHANNEL_ID // NOWA ZMIENNA
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !OWNER_ID || !CHANNEL_ID || !ROLE_ID || /*!DOC_URL ||*/ !GUILD_ID || !LEADER_ROLE_ID || !PANEL_CHANNEL_ID || !QUEUE_CHANNEL_ID || !GAME_LOBBY_VOICE_CHANNEL_ID || !WAITING_ROOM_VOICE_CHANNEL_ID || !VOICE_CREATOR_CHANNEL_ID || !TEMP_CHANNEL_CATEGORY_ID || !TEMP_VC_CONTROL_PANEL_CATEGORY_ID ) {
    consola.warn('⚠️ One or more critical ENV variables might be missing. Ensure all required ones are set.');
    if (!MVP_ROLE_ID) consola.warn("MVP_ROLE_ID is missing, MVP award feature will be disabled.");
    if (!VOICE_CREATOR_CHANNEL_ID || !TEMP_CHANNEL_CATEGORY_ID) consola.warn("VOICE_CREATOR_CHANNEL_ID or TEMP_CHANNEL_CATEGORY_ID are missing, temporary voice channel creation will be disabled.");
    if (!TEMP_VC_CONTROL_PANEL_CATEGORY_ID) consola.warn("TEMP_VC_CONTROL_PANEL_CATEGORY_ID is missing, temporary voice channel control panel creation in a channel will be disabled.");
    if (!MONITORED_VC_ID || !LOG_TEXT_CHANNEL_ID) consola.warn("MONITORED_VC_ID or LOG_TEXT_CHANNEL_ID are missing, voice join logging will be disabled.");
    if (!DISCORD_TOKEN || !CLIENT_ID || !OWNER_ID) {
        consola.error('❌ Critical ENV variables (TOKEN, CLIENT_ID, OWNER_ID) are missing!');
        process.exit(1);
    }
}

// --- DATA DIRECTORY SETUP ---
const DATA_DIR = process.env.RENDER_DISK_MOUNT_PATH || path.join(__dirname, 'bot_data'); 

if (!fs.existsSync(DATA_DIR)){
    fs.mkdirSync(DATA_DIR, { recursive: true });
    consola.info(`Created data directory at: ${DATA_DIR}`);
}

// --- FILE HELPERS (Zaktualizowane ścieżki) ---
const ANKIETA_IMG_URL = 'https://i.imgur.com/8G1Dmkf.jpeg'; // Zaktualizowany URL
const RANKING_IMG_URL = 'https://i.ibb.co/zWG5KfW/image.png'; // Miniatura dla rankingu
const MAIN_RANKING_IMAGE_URL = 'https://i.imgur.com/YqYm9oR.jpeg'; // Główny obrazek rankingu

const RANK_FILE = path.join(DATA_DIR, 'rank.json'); 
const WYNIK_RANK_FILE = path.join(DATA_DIR, 'wynikRank.json');
const PANEL_ID_FILE = path.join(DATA_DIR, 'panel_message_id.txt'); // Nadal używane, jeśli panel jest statyczny
const QUEUE_MESSAGE_ID_FILE = path.join(DATA_DIR, 'queue_message_id.txt');
const FACTION_STATS_FILE = path.join(DATA_DIR, 'factionStats.json'); 

function loadJSON(filePath, defaultValue = {}) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
        return defaultValue;
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
        fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
        return defaultValue;
    }
}
function saveJSON(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
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

function getWynikRanking(includeMvpMention = false, mvpUserId = null) {
    const wr = loadWynikRank(); 

    const sortedDisplay = Object.entries(wr)
        .sort(([, aPoints], [, bPoints]) => bPoints - aPoints) 
        .slice(0, 10) 
        .map(([userId, points], i) => {
            let mvpMarker = '';
            if (includeMvpMention && userId === mvpUserId) {
                mvpMarker = ' 👑 **MVP Tygodnia!**';
            }
            return `${i + 1}. <@${userId}> – ${points} pkt${mvpMarker}`; 
        });

    const rankingText = sortedDisplay.length ? sortedDisplay.join('\n') : 'Brak danych do wyświetlenia.\nZacznijcie grać i zdobywać punkty!';
    
    return rankingText;
}


function recordPollVoteActivity(userId) { 
    const pollActivity = loadJSON(RANK_FILE, {});
    pollActivity[userId] = (pollActivity[userId] || 0) + 1;
    saveJSON(RANK_FILE, pollActivity);
    consola.info(`[Poll Activity] Recorded vote for ${userId}. Total votes for this cycle: ${pollActivity[userId]}`);
}
function addPollPoints(userId) { 
    updateWynikRank(userId, 100); 
    consola.info(`[Poll Voting] Added 100 points to ${userId} for first vote in poll cycle.`);
}

function resetPollActivityData() { 
    saveJSON(RANK_FILE, {});
    consola.info('📉 Dane aktywności w ankietach (rank.json) do śledzenia pierwszego głosu zresetowane.');
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

// Usunięto getRoleDescription, checkForDocUpdate

// NOWE LISTY GIF-ÓW
const WINNING_POLL_GIFS = [
    'https://media.tenor.com/npVhw1RtprpAAAAC/among-us-orange.gif',
    'https://media.tenor.com/ir9j4owKpVpAAAAC/among-us-dance.gif',
    'https://media.tenor.com/dE7W4HeG1klAAAAC/among-us-yellow.gif',
    'https://media.tenor.com/xR6AbprFsJIAAAAC/among-us-red.gif',
    'https://media.tenor.com/V5L0vjZ0lVcAAAAC/among-us-dance.gif',
    'https://media.tenor.com/40kdkGTG0oAAAAAC/among-us.gif',
    'https://media.tenor.com/uVP0V5ALGIAAAAAC/among-us.gif',
    'https://media.tenor.com/T1P50s57x4QAAAAC/among-us.gif',
    'https://media.tenor.com/dhyB3hJ6EwdAAAAC/among-us-orange.gif',
    'https://media.tenor.com/Q2Ri8x13aYMAAAAC/among-us.gif',
    'https://media.tenor.com/beNJu.gif' // Czerwony tańczy inaczej
];

const TIE_POLL_GIFS = [
    'https://media.tenor.com/bkl7VKqN0ckAAAAC/among-us-among-us-spin.gif',
    'https://media.tenor.com/vrFOtiD1pHQAAAAC/among-us-spin.gif',
    'https://media.tenor.com/Hz3ckWksWmAAAAAC/among-us-among-us-vent.gif' 
];

const NO_VOTES_GIF = 'https://c.tenor.com/x65m9H2F0wAAAAAC/among-us.gif'; // Shhh
const DEFAULT_POLL_GIF = 'https://c.tenor.com/Z3z0vYATH_IAAAAC/among-us-task.gif'; // Generic fallback


async function registerCommands() {
    const cmds = []; // Komendy będą teraz tylko statyczne

    // Komendy, które były wcześniej zależne od DOC_URL, teraz muszą być dodane statycznie, jeśli są potrzebne,
    // lub ich funkcjonalność została usunięta.
    // ['reload', 'ranking', 'ankieta'].forEach(n => names.add(n)); // Ta część jest już niepotrzebna

    cmds.push(
        new SlashCommandBuilder().setName('reload').setDescription('Przeładuj konfigurację komend (tylko Owner).').toJSON()
    );
    // Komenda /ranking teraz będzie aliasem do /wynikirank lub usunięta. Na razie zostawiam jako /wynikirank.
    // Komenda /ankieta jako taka nie ma sensu, bo ankiety są automatyczne lub testowe.

    cmds.push(
        new SlashCommandBuilder()
            .setName('wynikirank')
            .setDescription('Pokaż ranking punktów.') 
            .toJSON()
    );
    cmds.push(
        new SlashCommandBuilder()
            .setName('zakoncz') 
            .setDescription('Zakończ aktualnie trwające głosowanie (admin)')
            .toJSON()
    );
    cmds.push(
        new SlashCommandBuilder()
            .setName('ankieta_test_start')
            .setDescription('TEST: Ręcznie uruchamia ankietę (admin).')
            .toJSON()
    );
    cmds.push(
        new SlashCommandBuilder()
            .setName('kolejka_start')
            .setDescription('Rozpoczyna i wyświetla panel kolejki (admin)')
            .toJSON()
    );
    cmds.push(
        new SlashCommandBuilder()
            .setName('dodaj') 
            .setDescription('Dodaje gracza na koniec kolejki (admin).')
            .addUserOption(option => option.setName('uzytkownik').setDescription('Gracz do dodania.').setRequired(true))
            .toJSON()
    );
    cmds.push(
        new SlashCommandBuilder()
            .setName('pozycja')
            .setDescription('Ustawia gracza na konkretnej pozycji w kolejce (admin).')
            .addIntegerOption(option => 
                option.setName('wartosc')
                .setDescription('Numer pozycji w kolejce (zaczynając od 1).')
                .setRequired(true)
                .setMinValue(1)
            )
            .addUserOption(option => 
                option.setName('uzytkownik')
                .setDescription('Gracz, którego pozycję chcesz ustawić.')
                .setRequired(true)
            )
            .toJSON()
    );
    cmds.push(
        new SlashCommandBuilder()
            .setName('kolejka_nastepny')
            .setDescription('Pobiera następną osobę z kolejki (admin) i próbuje przenieść do lobby.')
            .addIntegerOption(option =>
                option.setName('liczba')
                    .setDescription('Liczba osób do pobrania (domyślnie 1)')
                    .setRequired(false)
            )
            .toJSON()
    );
    cmds.push(
        new SlashCommandBuilder()
            .setName('kolejka_wyczysc')
            .setDescription('Czyści całą kolejkę (admin)')
            .toJSON()
    );

    const winCommand = new SlashCommandBuilder()
        .setName('win')
        .setDescription('Rozpocznij proces przyznawania punktów za role.');
    cmds.push(winCommand.toJSON());
    
    cmds.push(
        new SlashCommandBuilder()
            .setName('wyczysc_ranking_punktow') 
            .setDescription('Czyści cały ranking punktów (admin).')
            .toJSON()
    );
    cmds.push(
        new SlashCommandBuilder()
            .setName('usun_punkty')
            .setDescription('Odejmuje punkty danemu użytkownikowi (admin).')
            .addUserOption(option => 
                option.setName('uzytkownik')
                .setDescription('Użytkownik, któremu chcesz odjąć punkty.')
                .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName('liczba_punktow')
                .setDescription('Liczba punktów do odjęcia.')
                .setRequired(true)
                .setMinValue(1) 
            )
            .toJSON()
    );

    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), // Nadal rejestrujemy dla konkretnego GUILD_ID, bo bot działa na jednym serwerze
            { body: cmds }
        );
        consola.success(`✅ Registered ${cmds.length} commands in guild ${GUILD_ID}`);
    } catch (error) {
        consola.error(`❌ Failed to register commands in guild ${GUILD_ID}:`, error);
    }
}

// Usunięto checkForDocUpdate

// --- PANEL EMBED & ROW ---
function getPanelEmbed() {
    return new EmbedBuilder()
        .setTitle('Panel rankingów Among Us')
        .setDescription('Ranking dostępny jest poprzez komendę /wynikirank'); // Zmieniono opis, bo nie ma przycisku
}
function getPanelRow() {
    // Usunięto przycisk, więc panel nie ma komponentów
    return null; // Lub new ActionRowBuilder() jeśli chcesz pusty, ale lepiej null i nie dodawać do send/edit
}

// --- ANKIETA ---
const susMessagePart = "\n\n💡Ale wiecie, co jest jeszcze bardziej SUS?\n\n🔔Próba wejścia do gry po 19:00 i zdziwienie, że już nie ma miejsca.\n     Gramy i tak od 19:00. Bądź wcześniej i zaklep sobie slota!";

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

        votesCollection.forEach((voteCustomId, userId) => {
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
                summaryDescription = "🗳️ Godzina 19:00 wybrana przez Psychopatów!\n\n🧠  Wszyscy wiemy, że to jedyna pora żeby zdążyć zanim zacznie się... coś więcej.\n\n 🕖 Przyjdź punktualnie. Zaufanie zbudujemy tylko raz.";
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
            if (TIE_POLL_GIFS.length > 0) {
                gifUrl = TIE_POLL_GIFS[Math.floor(Math.random() * TIE_POLL_GIFS.length)];
            } else {
                gifUrl = DEFAULT_POLL_GIF;
            }
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
// const temporaryVoiceChannels = new Map(); // Poprawka: Już zadeklarowane globalnie na początku


function isUserAdmin(interactionOrUser, guild) {
    const userId = interactionOrUser.user ? interactionOrUser.user.id : interactionOrUser.id;
    if (userId === OWNER_ID) return true;
    if (!guild) { 
        consola.warn("[isUserAdmin] Guild object is undefined.");
        return false;
    }
    const member = guild.members.cache.get(userId);
    return member && member.roles.cache.has(LEADER_ROLE_ID);
}

async function attemptMovePlayerToLobby(interaction, userId, guild) {
    try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return `Nie znaleziono gracza <@${userId}> na serwerze.`;

        if (member.voice.channelId && member.voice.channelId === WAITING_ROOM_VOICE_CHANNEL_ID) {
            await member.voice.setChannel(GAME_LOBBY_VOICE_CHANNEL_ID);
            return `Gracz <@${userId}> został przeniesiony z poczekalni do lobby gry.`;
        } else if (member.voice.channelId) {
            return `Gracz <@${userId}> jest na innym kanale głosowym (<#${member.voice.channelId}>), nie w poczekalni. Nie został przeniesiony.`;
        } else {
            return `Gracz <@${userId}> nie jest na żadnym kanale głosowym.`;
        }
    } catch (error) {
        consola.error(`[MovePlayer] Error moving user ${userId}:`, error);
        if (error.code === 50013) { 
            return `Nie udało się przenieść gracza <@${userId}> - brak uprawnień bota do przenoszenia.`;
        } else if (error.code === 50001) { 
            return `Nie udało się przenieść gracza <@${userId}> - brak dostępu bota do kanału.`;
        }
        return `Nie udało się przenieść gracza <@${userId}> (błąd: ${error.message}).`;
    }
}


function getQueueEmbed() {
    const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('🔪 Lobby pełne? Zajmij miejsce w kolejce! 🔪')
        .setDescription('Użyj przycisków poniżej, aby zarządzać swoim miejscem w kolejce.')
        .addFields({ name: 'Rozmiar kolejki', value: `**${currentQueue.length}** graczy` });

    if (isLobbyLocked) {
        embed.addFields({ name: '🔒 Lobby Zamknięte', value: 'Lobby osiągnęło limit graczy. Tylko osoby z kolejki mogą dołączyć.' });
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

function getQueueActionRow(isAdmin = false) {
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

    if (isAdmin) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('queue_pull_next')
                .setLabel('Pull') 
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎣')
        );
    }
    return row;
}

async function updateQueueMessage(interaction) { 
    if (!queueMessage) {
        consola.debug('updateQueueMessage: queueMessage is null, skipping update. Use /kolejka_start to initialize.');
        return;
    }

    try {
        const guild = interaction.guild || await client.guilds.fetch(GUILD_ID);
        const userForAdminCheck = interaction.user ? interaction.user : (interaction.id ? interaction : { id: OWNER_ID, user: {id: OWNER_ID} });
        const adminStatus = isUserAdmin(userForAdminCheck, guild);
        await queueMessage.edit({ embeds: [getQueueEmbed()], components: [getQueueActionRow(adminStatus)] });
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
        // Usunięto przycisk Usuń Kanał
        // new ButtonBuilder().setCustomId(`tempvc_delete_${vcId}`).setLabel('Usuń Kanał').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
    );

    // Jeśli row2 jest pusty po usunięciu przycisku, nie dodawaj go
    const components = [row1];
    if (row2.components.length > 0) {
        components.push(row2);
    }

    return { embeds: [embed], components: components };
}


// --- BOT SETUP ---
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMembers] });
const votes = new Collection(); 
let voteMessage = null; 
const temporaryVoiceChannels = new Map();


async function manualStartPoll(interaction) {
    if (!isUserAdmin(interaction, interaction.guild)) {
        return interaction.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });
    }

    try {
        const pollChannel = await client.channels.fetch(CHANNEL_ID);
        if (!pollChannel) {
            consola.error(`[Manual Poll Start] Nie znaleziono kanału dla ankiet (CHANNEL_ID: ${CHANNEL_ID})`);
            return interaction.reply({ content: '❌ Nie znaleziono kanału dla ankiet.', ephemeral: true });
        }

        votes.clear();
        consola.info('[Manual Poll Start] Lokalna kolekcja głosów (votes) wyczyszczona.');

        const initialPollEmbeds = buildPollEmbeds(votes);

        const pollRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('vote_19').setEmoji('<:amongus:1369715159806902393>').setLabel('A może wcześniej? (19:00)').setStyle(ButtonStyle.Danger), // Zmieniony styl
            new ButtonBuilder().setCustomId('vote_20').setEmoji('<:catJAM:1369714552916148224>').setLabel('Będę! (20:00)').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('vote_21').setEmoji('<:VibingRabbit:1369714461568663784>').setLabel('Będę, ale później (21:00)').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('vote_22').setEmoji('<:SUSSY:1369714561938362438>').setLabel('Będę, ale później (22:00)').setStyle(ButtonStyle.Secondary), // Zmieniony styl
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

    // Usunięto logikę związaną z DOC_URL (lastDocHash, checkForDocUpdate)
    await registerCommands();
    // Usunięto setInterval(checkForDocUpdate, ...)

    const panelCh = await client.channels.fetch(PANEL_CHANNEL_ID).catch(e => {
        consola.error(`Failed to fetch PANEL_CHANNEL_ID ${PANEL_CHANNEL_ID}: ${e.message}`);
        return null;
    });
    if (panelCh) {
        let panelMessageId = loadPanelMessageId();
        let panelMsg = null;
        if (panelMessageId) {
            try { panelMsg = await panelCh.messages.fetch(panelMessageId); } catch { consola.warn("Nie udało się załadować panelMsg, tworzenie nowego."); }
        }
        
        const panelContent = { embeds: [getPanelEmbed()] };
        const panelComponents = getPanelRow(); // Może zwrócić null
        if (panelComponents && panelComponents.components.length > 0) { // Tylko dodaj komponenty, jeśli istnieją
            panelContent.components = [panelComponents];
        }


        if (!panelMsg) {
            try {
                const sent = await panelCh.send(panelContent); 
                savePanelMessageId(sent.id);
                consola.info(`Panel created (ID: ${sent.id})`);
            } catch (e) { consola.error("Failed to create new panel message:", e.message); }
        } else {
            try {
                await panelMsg.edit(panelContent); 
                consola.info(`Panel refreshed (ID: ${panelMsg.id})`);
            } catch (e) { consola.error("Failed to refresh panel message:", e.message); }
        }
    }


    const queueChannel = await client.channels.fetch(QUEUE_CHANNEL_ID).catch(err => {
        consola.error(`Nie można załadować kanału kolejki o ID ${QUEUE_CHANNEL_ID}: ${err}`);
        return null;
    });

    if (queueChannel) {
        const qMsgId = loadQueueMessageId();
        if (qMsgId) {
            try {
                queueMessage = await queueChannel.messages.fetch(qMsgId);
                consola.info(`Queue message loaded (ID: ${queueMessage.id}). Performing initial update.`);
                const guild = await client.guilds.fetch(GUILD_ID);
                const ownerUser = { id: OWNER_ID, user: {id: OWNER_ID} };
                const pseudoInteraction = { guild: guild, user: ownerUser, channel: queueMessage.channel };
                await updateQueueMessage(pseudoInteraction); 
                consola.info(`Queue message refreshed (ID: ${queueMessage.id})`);
            } catch (err) {
                consola.warn(`Nie udało się załadować wiadomości kolejki (ID: ${qMsgId}). Prawdopodobnie została usunięta. Użyj /kolejka_start.`);
                queueMessage = null;
                saveQueueMessageId('');
            }
        } else {
            consola.info('Brak zapisanej wiadomości kolejki. Użyj /kolejka_start, aby ją utworzyć.');
            queueMessage = null;
        }
    } else {
        queueMessage = null;
    }

    try {
        const gameLobby = await client.channels.fetch(GAME_LOBBY_VOICE_CHANNEL_ID);
        if (gameLobby && gameLobby.type === ChannelType.GuildVoice) {
             const nonBotMembers = gameLobby.members.filter(m => !m.user.bot).size;
            if (nonBotMembers >= 18) {
                isLobbyLocked = true;
                consola.info(`Lobby (ID: ${GAME_LOBBY_VOICE_CHANNEL_ID}) jest pełne przy starcie (${nonBotMembers} graczy). Ustawiono isLobbyLocked = true.`);
            } else {
                 consola.info(`Lobby (ID: ${GAME_LOBBY_VOICE_CHANNEL_ID}) ma ${nonBotMembers} graczy przy starcie. isLobbyLocked = false.`);
            }
        }
    } catch (error) {
        consola.error(`Nie udało się sprawdzić stanu lobby przy starcie: ${error}`);
    }

    schedule.scheduleJob('15 3 * * *', async () => { 
        try {
            const pollChannel = await client.channels.fetch(CHANNEL_ID);
            if (!pollChannel) {
                consola.error(`Nie znaleziono kanału dla ankiet (CHANNEL_ID: ${CHANNEL_ID})`);
                return;
            }
            votes.clear(); 
            consola.info('Lokalna kolekcja głosów (votes) wyczyszczona przed nową ankietą.');
            const initialPollEmbeds = buildPollEmbeds(votes); 
            const pollRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('vote_19').setEmoji('<:amongus:1369715159806902393>').setLabel('A może wcześniej? (19:00)').setStyle(ButtonStyle.Danger), // Zmieniony styl
                new ButtonBuilder().setCustomId('vote_20').setEmoji('<:catJAM:1369714552916148224>').setLabel('Będę! (20:00)').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('vote_21').setEmoji('<:VibingRabbit:1369714461568663784>').setLabel('Będę, ale później (21:00)').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('vote_22').setEmoji('<:SUSSY:1369714561938362438>').setLabel('Będę, ale później (22:00)').setStyle(ButtonStyle.Secondary), // Zmieniony styl
                new ButtonBuilder().setCustomId('poll_show_voters').setEmoji('👀').setLabel('Pokaż Głosujących').setStyle(ButtonStyle.Secondary)
            );
            let contentMessage = '';
            if (ROLE_ID) {
                contentMessage = `<@&${ROLE_ID}>`;
            }
            if (voteMessage) {
                try {
                    await voteMessage.delete();
                    consola.info('Stara wiadomość ankiety (voteMessage) usunięta.');
                } catch (e) {
                    consola.warn('Nie udało się usunąć starej voteMessage (mogła już nie istnieć).');
                }
            }
            voteMessage = await pollChannel.send({ content: contentMessage, embeds: initialPollEmbeds, components: [pollRow] });
            consola.info(`Ankieta godzinowa została wysłana na kanał ${pollChannel.name} (ID: ${voteMessage.id})`);
        } catch (e) { consola.error('Error scheduling vote start:', e); }
    });

    schedule.scheduleJob('55 3 * * *', async () => { 
        try {
            if (voteMessage) {
                const result = await endVoting(voteMessage, votes); 
                if (result) {
                    consola.info('Głosowanie zakończone i wyniki ogłoszone.');
                    voteMessage = null; 
                } else {
                    consola.error("endVoting returned false.");
                }
            } else {
                consola.info('Próba zakończenia głosowania, ale wiadomość ankiety (voteMessage) nie jest aktywna lub nie istnieje.');
            }
        } catch (e) { consola.error('Error scheduling vote end:', e); }
    });

    schedule.scheduleJob('0 0 * * 1', resetPollActivityData); 

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
            
            const targetChannel = await client.channels.fetch(PANEL_CHANNEL_ID); 
            if (targetChannel) {
                const rankingDescription = getWynikRanking(true, mvpOfTheWeekId); 
                
                let mvpAnnouncement = "";
                if (mvpOfTheWeekId) {
                    mvpAnnouncement = `\n\n👑 **MVP Tygodnia:** <@${mvpOfTheWeekId}> z ${topPlayerPoints} pkt! Gratulacje!`;
                } else if (sortedPlayers.length > 0) {
                    mvpAnnouncement = "\n\n👑 Nie udało się ustalić MVP tygodnia (np. brak roli lub gracz opuścił serwer)."
                } else {
                     mvpAnnouncement = "\n\n👑 Brak graczy w rankingu, aby wyłonić MVP.";
                }


                const embed = new EmbedBuilder()
                    .setTitle('🔪MVP AMONG TYGODNIA🔪') // Zmieniony tytuł
                    .setDescription(rankingDescription + mvpAnnouncement) 
                    .setColor(0xDAA520) 
                    .setThumbnail(RANKING_IMG_URL) 
                    .setImage(MAIN_RANKING_IMAGE_URL) // Dodana główna grafika
                    .setFooter({ text: "Gratulacje!!" }); 
                await targetChannel.send({ embeds: [embed] });
            } else {
                consola.error(`Nie znaleziono kanału ${PANEL_CHANNEL_ID} do wysłania rankingu punktów.`);
            }
        } catch (e) { consola.error('Error sending weekly score ranking or assigning MVP:', e); }
    });
});

client.on('interactionCreate', async i => {
    try {
        if (i.isButton()) {
            const panelMsgId = loadPanelMessageId();
            // Usunięto obsługę przycisku z panelu, bo przycisk został usunięty
            // if (i.message.id === panelMsgId) {
            //     if (i.customId === 'show_wynikirank') { ... }
            // }
        }

        if (i.isButton() && i.customId.startsWith('vote_')) {
            if (!voteMessage || i.message.id !== voteMessage.id) {
                return i.reply({ content: 'To głosowanie jest już nieaktywne lub zakończone.', ephemeral: true });
            }
            const user = i.user.id;
            const newVote = i.customId;
            const oldVote = votes.get(user);

            let replyMessageContent = '';

            if (oldVote === newVote) {
                votes.delete(user);
                replyMessageContent = 'Twój głos został wycofany.';
            } else {
                const pollActivityData = loadJSON(RANK_FILE, {});
                if (!pollActivityData[user]) { 
                    addPollPoints(user); 
                    recordPollVoteActivity(user); 
                } else if (oldVote === undefined) { 
                    recordPollVoteActivity(user);
                }
                
                votes.set(user, newVote);
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
                return i.reply({ content: '❌ Nie masz uprawnień.', ephemeral: true });
            }
            await i.deferUpdate();

            const roleType = i.customId.replace('points_role_', '');

            const userSelect = new UserSelectMenuBuilder()
                .setCustomId(`points_user_select_${roleType}`)
                .setPlaceholder('Wybierz graczy (max 25)...')
                .setMinValues(1)
                .setMaxValues(25);

            const rowSelect = new ActionRowBuilder().addComponents(userSelect);

            let roleNameDisplay = "Crewmate (+1 pkt)";
            if (roleType === 'neutral') roleNameDisplay = "Neutral (+3 pkt)";
            else if (roleType === 'impostor') roleNameDisplay = "Impostor (+2 pkt)";

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
                return i.reply({ content: '❌ Nie masz uprawnień.', ephemeral: true });
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
                    points = 3;
                    roleNameDisplay = "Neutral";
                } else if (roleType === 'impostor') {
                    points = 2;
                    roleNameDisplay = "Impostor";
                } else if (roleType === 'crewmate') {
                    points = 1;
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


            let finalSummary = `🏆 **Podsumowanie Punktacji (${roleType === 'neutral' ? 'Neutral' : roleType === 'impostor' ? 'Impostor' : 'Crewmate'}):**\n` + summaryLines.join('\n');
            if (summaryLines.length === 0) {
                finalSummary = "Nie wybrano żadnych graczy lub wystąpiły błędy.";
            }

            await i.editReply({ content: finalSummary, components: [], embeds: [] });
            consola.info(`[Points System] Points awarded by ${i.user.tag} for role ${roleType}.`);
            return;
        }


        if (i.isButton() && i.customId.startsWith('queue_')) {
            if (i.customId === 'queue_pull_next') {
                if (!isUserAdmin(i, i.guild)) {
                    return i.reply({ content: '❌ Nie masz uprawnień do tej akcji.', ephemeral: true });
                }
                if (!queueMessage) {
                    return i.reply({ content: 'Panel kolejki nie jest obecnie aktywny. Użyj `/kolejka_start`.', ephemeral: true });
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
                        await i.followUp({ content: 'Panel kolejki nie jest obecnie aktywny. Poproś administratora o użycie `/kolejka_start`.', ephemeral: true });
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
            } else if (action === 'delete') { // Usunięto przycisk, więc ta gałąź nie powinna być osiągalna przez przyciski panelu
                 // Ale zostawiam na wypadek przyszłych komend
                const confirmRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`tempvc_delete_confirm_${vcChannelId}`).setLabel('Tak, usuń').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(`tempvc_delete_cancel_${vcChannelId}`).setLabel('Anuluj').setStyle(ButtonStyle.Secondary)
                );
                await i.reply({content: `Czy na pewno chcesz usunąć kanał **${voiceChannel.name}**?`, components: [confirmRow], ephemeral: true});
                return;
            } else if (action === 'delete' && parts[2] === 'confirm') {
                await voiceChannel.delete('Usunięty przez właściciela za pomocą panelu.').catch(e => consola.error("Error deleting VC on confirm:", e));
                if (channelData.controlTextChannelId) {
                    const controlTextChannel = await i.guild.channels.fetch(channelData.controlTextChannelId).catch(() => null);
                    if (controlTextChannel) await controlTextChannel.delete('Associated VC deleted by owner.').catch(e => consola.error("Error deleting control text channel:", e));
                }
                temporaryVoiceChannels.delete(vcChannelId);
                await i.update({ content: '✅ Kanał został pomyślnie usunięty.', embeds: [], components: [] });
                return;
            } else if (action === 'delete' && parts[2] === 'cancel') {
                await i.update({ content: 'Anulowano usuwanie kanału.', components: []});
                const updatedPanel = await getTempVoiceChannelControlPanelMessage(voiceChannel.name, vcChannelId, channelData.isLocked, client, i.guildId);
                if (i.message) { 
                     await i.message.edit(updatedPanel).catch(e => consola.warn("Failed to re-edit panel on cancel:", e.message));
                }
                return;
            }
            
            if (!['rename', 'limit', 'permit', 'reject', 'kick', 'delete'].includes(action) || 
                (action === 'delete' && parts[2] !== 'confirm' && parts[2] !== 'cancel')) {
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
                    if (targetUser.id === i.user.id) {
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
        const cmd = i.commandName;
        consola.info(`Command: /${cmd} by ${i.user.tag} (ID: ${i.user.id}) in channel ${i.channel.name} (ID: ${i.channel.id})`);

        if (cmd === 'ankieta_test_start') {
            return manualStartPoll(i); 
        }

        if (cmd === 'win') {
            if (!isUserAdmin(i, i.guild)) { 
                return i.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('🏆 Przyznawanie Punktów "Psychopaci"')
                .setDescription('Krok 1: Wybierz rolę, za którą chcesz przyznać punkty.')
                .setColor(0x2ECC71);

            const roleButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('points_role_neutral').setLabel('Neutral (+3 pkt)').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('points_role_impostor').setLabel('Impostor (+2 pkt)').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('points_role_crewmate').setLabel('Crewmate (+1 pkt)').setStyle(ButtonStyle.Success)
                );

            await i.reply({ embeds: [embed], components: [roleButtons], ephemeral: true });
            return;
        }

        if (cmd === 'wynikirank') {
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
                .setThumbnail(RANKING_IMG_URL)
                .setImage(MAIN_RANKING_IMAGE_URL) // Dodana główna grafika
                .setDescription(getWynikRanking(true, currentMvpId)); 
            return i.reply({ embeds: [embed], ephemeral: true });
        }
        
        if (cmd === 'reload') {
            if (!isUserAdmin(i, i.guild)) return i.reply({ content: '❌ No permission.', ephemeral: true });
            await i.deferReply({ ephemeral: true });
            await registerCommands();
            return i.editReply('✅ Commands reloaded.');
        }
        if (cmd === 'zakoncz') {
            if (!isUserAdmin(i, i.guild)) return i.reply({ content: '❌ No permission.', ephemeral: true });
            if (!voteMessage) return i.reply({ content: '❌ No ongoing vote.', ephemeral: true });
            await i.deferReply({ ephemeral: true });
            const res = await endVoting(voteMessage, votes, true); 
            if (res) {
                voteMessage = null; 
                return i.editReply('✅ Vote ended.');
            }
            return i.editReply('❌ Failed to end vote.');
        }
        
        if (cmd === 'kolejka_start') {
            if (!isUserAdmin(i, i.guild)) return i.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });

            const queueChannel = await client.channels.fetch(QUEUE_CHANNEL_ID).catch(err => {
                consola.error(`Nie można załadować kanału kolejki o ID ${QUEUE_CHANNEL_ID} w /kolejka_start: ${err}`);
                return null;
            });

            if (!queueChannel) return i.reply({ content: `❌ Nie znaleziono kanału kolejki (ID: ${QUEUE_CHANNEL_ID}). Sprawdź konfigurację.`, ephemeral: true });

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
            const adminStatus = isUserAdmin(i, i.guild); 
            try {
                queueMessage = await queueChannel.send({ embeds: [getQueueEmbed()], components: [getQueueActionRow(adminStatus)] });
                saveQueueMessageId(queueMessage.id);
                await i.reply({ content: `✅ Panel kolejki został uruchomiony w kanale <#${QUEUE_CHANNEL_ID}>. Lobby jest odblokowane.`, ephemeral: true });
            } catch (sendError) {
                consola.error('Nie udało się wysłać nowej wiadomości panelu kolejki:', sendError);
                await i.reply({ content: '❌ Wystąpił błąd podczas tworzenia panelu kolejki.', ephemeral: true });
            }
            return;
        }
        if (cmd === 'dodaj') { 
            if (!isUserAdmin(i, i.guild)) {
                return i.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });
            }
            if (!queueMessage) {
                return i.reply({ content: 'Panel kolejki nie jest aktywny. Użyj `/kolejka_start` najpierw.', ephemeral: true });
            }
            const userToAdd = i.options.getUser('uzytkownik');
            if (currentQueue.includes(userToAdd.id)) {
                return i.reply({ content: `<@${userToAdd.id}> jest już w kolejce.`, ephemeral: true });
            }
            currentQueue.push(userToAdd.id);
            await updateQueueMessage(i);
            return i.reply({ content: `✅ Dodano <@${userToAdd.id}> na koniec kolejki.`, ephemeral: true });
        }
        if (cmd === 'pozycja') {
            if (!isUserAdmin(i, i.guild)) {
                return i.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });
            }
            if (!queueMessage) {
                return i.reply({ content: 'Panel kolejki nie jest aktywny. Użyj `/kolejka_start` najpierw.', ephemeral: true });
            }
        
            const userToPosition = i.options.getUser('uzytkownik');
            const desiredPosition = i.options.getInteger('wartosc'); 
        
            if (desiredPosition <= 0) {
                return i.reply({ content: '❌ Pozycja musi być liczbą dodatnią.', ephemeral: true });
            }
        
            const existingIndex = currentQueue.indexOf(userToPosition.id);
            if (existingIndex > -1) {
                currentQueue.splice(existingIndex, 1);
            }
        
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
        }

        if (cmd === 'kolejka_nastepny') {
            if (!isUserAdmin(i, i.guild)) return i.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });

            if (!queueMessage) {
                return i.reply({ content: 'Panel kolejki nie jest obecnie aktywny. Użyj `/kolejka_start`.', ephemeral: true });
            }

            const liczba = i.options.getInteger('liczba') || 1;
            if (currentQueue.length === 0) {
                return i.reply({ content: 'Kolejka jest pusta!', ephemeral: true });
            }

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

            await i.editReply({ content: `🎣 Następujące osoby zostały wyciągnięte z kolejki: ${pulledMentions}. ${overallMoveStatusMessage}`});
            return;
        }

        if (cmd === 'kolejka_wyczysc') {
            if (!isUserAdmin(i, i.guild)) return i.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });

            if (!queueMessage) {
                return i.reply({ content: 'Panel kolejki nie jest obecnie aktywny. Użyj `/kolejka_start`.', ephemeral: true });
            }
            currentQueue = [];
            lastPulledUserIds = [];
            await updateQueueMessage(i);
            return i.reply({ content: '✅ Kolejka została wyczyszczona.', ephemeral: true });
        }

        if (cmd === 'wyczysc_ranking_punktow') {
            if (!isUserAdmin(i, i.guild)) {
                return i.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });
            }
            saveWynikRank({});
            consola.info(`[Admin] Ranking punktów (wynikRank.json) został wyczyszczony przez ${i.user.tag}.`);
            await i.reply({ content: '✅ Ranking punktów został pomyślnie wyczyszczony!', ephemeral: true });
            return;
        }
        if (cmd === 'usun_punkty') {
            if (!isUserAdmin(i, i.guild)) {
                return i.reply({ content: '❌ Nie masz uprawnień do tej komendy.', ephemeral: true });
            }
            const userToRemovePoints = i.options.getUser('uzytkownik');
            const pointsToRemove = i.options.getInteger('liczba_punktow');

            if (pointsToRemove <= 0) {
                return i.reply({ content: '❌ Liczba punktów do usunięcia musi być dodatnia.', ephemeral: true });
            }

            const currentPoints = loadWynikRank();
            const userCurrentPoints = currentPoints[userToRemovePoints.id] || 0;

            if (userCurrentPoints === 0) {
                 return i.reply({ content: `ℹ️ Użytkownik <@${userToRemovePoints.id}> nie posiada żadnych punktów.`, ephemeral: true });
            }

            const newPoints = Math.max(0, userCurrentPoints - pointsToRemove); 
            currentPoints[userToRemovePoints.id] = newPoints;
            saveWynikRank(currentPoints);

            consola.info(`[Admin] Usunięto ${pointsToRemove} pkt użytkownikowi ${userToRemovePoints.tag}. Nowa liczba punktów: ${newPoints}. Akcja wykonana przez: ${i.user.tag}`);
            return i.reply({ content: `✅ Usunięto ${pointsToRemove} pkt użytkownikowi <@${userToRemovePoints.id}>. Nowa liczba punktów: ${newPoints}.`, ephemeral: true });
        }

        // Usunięto obsługę dynamicznych komend ról
        if (cmd === 'ankieta') { 
            await i.reply({content: "Ta komenda służy do interakcji z ankietami (głosowanie, sprawdzanie). Ankieta jest wysyłana automatycznie lub przez admina komendą `/ankieta_test_start`.", ephemeral: true});
        }
         else {
            // Jeśli to nie jest żadna ze znanych statycznych komend, a dynamiczne są usunięte:
            if (!['reload', 'ranking', 'wynikirank', 'zakoncz', 'ankieta_test_start', 'kolejka_start', 'dodaj', 'pozycja', 'kolejka_nastepny', 'kolejka_wyczysc', 'win', 'wyczysc_ranking_punktow', 'usun_punkty'].includes(cmd)){
                consola.warn(`Unknown command /${cmd} attempted by ${i.user.tag}`);
                await i.reply({ content: 'Nieznana komenda.', ephemeral: true });
            }
        }


    } catch (e) {
        consola.error('Error on interactionCreate:', e);
        try {
            if (i && i.replied === false && i.deferred === false) {
                await i.reply({ content: '❌ Wystąpił błąd podczas przetwarzania Twojego żądania.', ephemeral: true });
            } else if (i && i.deferred) {
                await i.editReply({ content: '❌ Wystąpił błąd podczas przetwarzania Twojego żądania. Spróbuj ponownie.' });
            }
        } catch (replyError) {
            consola.error('Dodatkowy błąd podczas próby odpowiedzi na błąd interakcji:', replyError);
        }
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    consola.info(`[voiceStateUpdate] Triggered. Old channel: ${oldState.channelId}, New channel: ${newState.channelId}, User: ${newState.member?.user.tag}`);
    if (typeof temporaryVoiceChannels !== 'undefined' && temporaryVoiceChannels instanceof Map) {
        consola.info(`[voiceStateUpdate] temporaryVoiceChannels is a Map with ${temporaryVoiceChannels.size} entries.`);
    } else {
        consola.error(`[voiceStateUpdate] temporaryVoiceChannels is NOT a Map or is undefined. Type: ${typeof temporaryVoiceChannels}`);
    }

    const guild = newState.guild || oldState.guild;
    if (!guild) return;

    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const gameLobbyChannel = await guild.channels.fetch(GAME_LOBBY_VOICE_CHANNEL_ID).catch(() => null);
    const waitingRoomChannel = await guild.channels.fetch(WAITING_ROOM_VOICE_CHANNEL_ID).catch(() => null);
    
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
                        deny: [PermissionsBitField.Flags.Connect], 
                        type: OverwriteType.Role
                    }
                ],
            });
            consola.info(`Created temporary VC "${vcName}" (ID: ${newVc.id}) for ${member.user.tag}. Owner: ${member.id}`);
            
            let creatorNameForChannel = member.displayName.toLowerCase().replace(/\s+/g, '-');
            creatorNameForChannel = creatorNameForChannel.replace(/[^a-z0-9-]/g, '');
            if (creatorNameForChannel.length > 25) creatorNameForChannel = creatorNameForChannel.substring(0, 25);
            if (creatorNameForChannel.length === 0) creatorNameForChannel = 'uzytkownika';
            const controlTextChannelName = `czat-${creatorNameForChannel}`; 

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
            
            const controlPanelMessageContent = await getTempVoiceChannelControlPanelMessage(newVc.name, newVc.id, true, client, guild.id); 
            consola.info(`[Temp VC] Attempting to send control panel to #${controlTextChannel.name}. Content:`, JSON.stringify(controlPanelMessageContent, null, 2));
            const panelMessage = await controlTextChannel.send(controlPanelMessageContent);
            consola.info(`[Temp VC] Control panel message sent with ID: ${panelMessage.id}. Components length: ${panelMessage.components?.length}`);


            temporaryVoiceChannels.set(newVc.id, { 
                ownerId: member.id, 
                vcId: newVc.id, 
                controlTextChannelId: controlTextChannel.id, 
                panelMessageId: panelMessage.id, 
                isLocked: true 
            });
            
            await member.send(`Twój prywatny kanał głosowy **${vcName}** (<#${newVc.id}>) został utworzony! Jest domyślnie **zablokowany**. Możesz nim zarządzać na kanale <#${controlTextChannel.id}>.`).catch(dmErr => consola.warn(`Nie udało się wysłać DM o utworzeniu kanału do ${member.user.tag}: ${dmErr.message}`));

        } catch (error) {
            consola.error(`Failed to create or manage temporary voice channel for ${member.user.tag}:`, error);
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


    // --- Logika ochrony lobby gry ---
    if (MONITORED_VC_ID && LOG_TEXT_CHANNEL_ID && newState.channelId === MONITORED_VC_ID && oldState.channelId !== MONITORED_VC_ID) {
        try {
            const logChannel = await client.channels.fetch(LOG_TEXT_CHANNEL_ID);
            const monitoredChannel = await client.channels.fetch(MONITORED_VC_ID);
            if (logChannel && logChannel.isTextBased() && monitoredChannel) {
                const time = new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                logChannel.send(`[${time}] Użytkownik ${member.user.tag} (<@${member.id}>) DOŁĄCZYŁ/A DO KANAŁU GŁOSOWEGO "${monitoredChannel.name}"`);
            }
        } catch (logError) {
            consola.error("Error logging user join to voice channel:", logError);
        }
    }


    if (!gameLobbyChannel || !waitingRoomChannel) {
        return;
    }

    const lobbyMemberCount = gameLobbyChannel.members.filter(m => !m.user.bot).size;
    const previousLobbyLockedStatus = isLobbyLocked;

    if (lobbyMemberCount >= 18) {
        isLobbyLocked = true;
    } else {
        isLobbyLocked = false;
    }

    if (isLobbyLocked !== previousLobbyLockedStatus && queueMessage) {
        consola.info(`Lobby lock status changed to: ${isLobbyLocked}. Updating queue panel.`);
        const pseudoInteractionUser = { id: client.user.id, user: client.user }; 
        const pseudoInteraction = { guild: guild, user: pseudoInteractionUser, channel: queueMessage.channel };
        await updateQueueMessage(pseudoInteraction);
    }

    if (newState.channelId === GAME_LOBBY_VOICE_CHANNEL_ID && oldState.channelId !== GAME_LOBBY_VOICE_CHANNEL_ID) {
        consola.info(`User ${member.user.tag} joined game lobby (ID: ${GAME_LOBBY_VOICE_CHANNEL_ID}). Current non-bot members: ${lobbyMemberCount}. Lobby locked: ${isLobbyLocked}`);

        if (isLobbyLocked) { 
            if (isUserAdmin({user: member.user}, guild)) { 
                consola.info(`Admin ${member.user.tag} joined locked lobby. Allowing.`);
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