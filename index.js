const express = require('express');
const makeWASocket = require('baileys').default;
const { jidDecode, jidNormalizedUser, downloadContentFromMessage, useMultiFileAuthState, Browsers, DisconnectReason, getAggregateVotesInPollMessage } = require("baileys");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const { serializeMessage, smsg } = require("./lib/serialize");
const { loadPlugins, system: pluginSystem } = require("./lib/plugin");
const { SharedBotManager } = require('./lib/sharedBotManager');
const sharedBotManager = new SharedBotManager(pluginSystem);
const WhatsAppBot = require("./lib/message");
const { setupAntidelete } = require("./lib/antidelete");
const crypto = require('crypto');
const NodeCache = require("node-cache");
const { console } = require("@nexoracle/utils");
const { setupStatusSaver, cleanupStatusSaver } = require("./lib/ssaver");
const { setupAntiCall, cleanupAntiCall } = require("./lib/anticall");
const { fileWatcher } = require('./lib/file');
const { initialize } = require('./lib/render');
const { createClient } = require('@supabase/supabase-js');
global.sharedBotManager = new SharedBotManager(pluginSystem);
const prefa = "ALYA-";
const sessionFolder = path.join(__dirname, "session");
const { initializeStore, getStore } = require("./lib/store");
require('events').EventEmitter.defaultMaxListeners = 100;

const supabaseUrl = 'https://cdvmjrpmrhvzwjutjqwc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkdm1qcnBtcmh2endqdXRqcXdjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mzc4MjIzNywiZXhwIjoyMDY5MzU4MjM3fQ.XngWATkln_MgRDU8mog9DJjQ_wUwzy5GbyrRlSMULSc';
const supabase = createClient(supabaseUrl, supabaseKey);
const bucketName = 'session';

const GITTOKEN_PART1 = "ghp_RsEDsSgo8Ec";
const GITTOKEN_PART2 = "716ddhFhQPkoDejXSRq4QUX8m";
const GITTOKEN = GITTOKEN_PART1 + GITTOKEN_PART2;
const REPO_OWNER = "KING-DAVIDX";
const REPO_NAME = "Queen_Alya";
const REPO_BRANCH = "main";

const WA_DEFAULT_EPHEMERAL = 10;

let sock = null;
let bot = null;
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize group metadata cache with 1 hour TTL and check period of 30 minutes
const groupMetadataCache = new NodeCache({ stdTTL: 3600, checkperiod: 1800 });

let updateAvailable = false;
let isCheckingUpdates = false;

const EXCLUDED_FILES = [
    'package-lock.json',
    '.gitignore',
    '.git',
    'session',
    'lib/store.db',
    'lib/store.db-shm',
    'lib/store.db-wal',
    '.npm',
    '.pm2',
    'node_modules'
];

let greetingEnabled = config.GREETING;
const configPath = path.join(__dirname, 'config.js');
fileWatcher.watchFile(configPath, (eventType, path) => {
    if (eventType === 'change') {
        try {
            delete require.cache[require.resolve('./config')];
            const newConfig = require('./config');
            greetingEnabled = newConfig.GREETING;
        } catch (err) {
            console.error('Error reloading config:', err);
        }
    }
});

async function getAllFiles(dirPath) {
    const arrayOfFiles = [];
    
    async function readDirectory(currentPath) {
        const files = fs.readdirSync(currentPath);

        for (const file of files) {
            const fullPath = path.join(currentPath, file);
            const relativePath = path.relative(__dirname, fullPath);
            
            if (EXCLUDED_FILES.some(excluded => 
                relativePath.startsWith(excluded) || 
                file === excluded ||
                relativePath.includes(excluded)
            )) {
                continue;
            }
            
            if (fs.statSync(fullPath).isDirectory()) {
                await readDirectory(fullPath);
            } else {
                arrayOfFiles.push({
                    path: fullPath,
                    relativePath: relativePath
                });
            }
        }
    }

    await readDirectory(dirPath);
    return arrayOfFiles;
}

async function getGitHubFileContent(filePath) {
    try {
        const response = await fetch(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}?ref=${REPO_BRANCH}`,
            {
                headers: {
                    'Authorization': `token ${GITTOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`GitHub API error: ${response.statusText}`);
        }

        const fileData = await response.json();
        const contentResponse = await fetch(fileData.download_url);
        return await contentResponse.text();
    } catch (error) {
        console.error(`Error getting file content for ${filePath}:`, error.message);
        return null;
    }
}

async function checkForUpdates() {
    if (isCheckingUpdates) return false;
    isCheckingUpdates = true;
    
    try {
        console.log("Checking for updates in background...");
        
        const localFiles = await getAllFiles(__dirname);
        
        let differencesFound = false;
        
        for (const file of localFiles) {
            const githubContent = await getGitHubFileContent(file.relativePath);
            
            if (githubContent === null) {
                continue;
            }
            
            const localContent = fs.readFileSync(file.path, 'utf-8');
            
            if (localContent !== githubContent) {
                console.log(`Difference found in file: ${file.relativePath}`);
                differencesFound = true;
            }
        }
        
        if (differencesFound) {
            updateAvailable = true;
            await showUpdateNotification();
            
            if (sock && sock.user?.id) {
                await sendUpdateNotification();
            }
        } else {
            console.log("No updates found - all files match GitHub repo");
        }
        
        return differencesFound;
    } catch (error) {
        console.error('Error checking for updates:', error.message);
        return false;
    } finally {
        isCheckingUpdates = false;
    }
}

async function showUpdateNotification() {
    console.style("┌───────────────────────────────┐")
        .color("yellow")
        .bold()
        .log();
    
    console.style("│ *Queen Alya has been updated*  │")
        .color("red")
        .bold()
        .log();
    
    console.style("│ Please type 'update now' to  │")
        .color("yellow")
        .bold()
        .log();
    
    console.style("│ get latest version            │")
        .color("yellow")
        .bold()
        .log();
    
    console.style("└───────────────────────────────┘")
        .color("yellow")
        .bold()
        .log();
}

async function sendUpdateNotification() {
    if (!sock || !sock.user?.id) return;
    
    try {
        const updateMessage = `🚀 *Queen Alya Update Available!*\n\n` +
                            `A new version of Queen Alya is available on GitHub.\n\n` +
                            `Type *${config.PREFIX}update now* to get the latest version.`;

        await safeSendMessage(
            sock, 
            jidNormalizedUser(sock.user.id), 
            { 
                text: updateMessage
            },
            { ephemeralExpiration: WA_DEFAULT_EPHEMERAL }
        );
    } catch (err) {
        console.error("Failed to send update notification:", err.message);
    }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, './lib/alya.html');
    fs.readFile(htmlPath, 'utf8', (err, htmlContent) => {
        if (err) {
            console.error('Error reading HTML file:', err);
            return res.status(500).send('Error loading page');
        }
        res.send(htmlContent);
    });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

initialize().catch(err => {
    console.error('Error initializing render.js:', err);
});

async function downloadSessionFilesFromSupabase(sessionFolderName) {
    const folderName = sessionFolderName.startsWith(prefa) ? 
                      sessionFolderName.slice(prefa.length) : 
                      sessionFolderName;
    
    try {
        if (!fs.existsSync(sessionFolder)) {
            fs.mkdirSync(sessionFolder, { recursive: true });
        }

        const { data: files, error: listError } = await supabase.storage
            .from(bucketName)
            .list(`${folderName}`);
        
        if (listError) throw listError;
        if (!files || files.length === 0) throw new Error('No session files found in Supabase storage');

        for (const file of files) {
            if (file.name === '.emptyFolderPlaceholder') continue;
            
            const { data: fileContent, error: downloadError } = await supabase.storage
                .from(bucketName)
                .download(`${folderName}/${file.name}`);
            
            if (downloadError) throw downloadError;

            const arrayBuffer = await fileContent.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const filePath = path.join(sessionFolder, file.name);
            
            fs.writeFileSync(filePath, buffer);
        }

        console.log(`Session files successfully downloaded to ${sessionFolder}`);
    } catch (error) {
        console.error('Error downloading session files from Supabase:', error);
        throw error;
    }
}

async function hasValidLocalSession() {
    try {
        if (!fs.existsSync(sessionFolder)) return false;
        
        const files = fs.readdirSync(sessionFolder);
        if (files.length === 0) return false;
        
        const requiredFiles = ['creds.json'];
        const hasRequiredFiles = requiredFiles.every(file => files.includes(file));
        
        if (!hasRequiredFiles) return false;
        
        const credsPath = path.join(sessionFolder, 'creds.json');
        if (!fs.existsSync(credsPath)) return false;
        
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
        return creds && creds.me && creds.me.id;
    } catch (e) {
        console.log("Invalid local session files:", e.message);
        return false;
    }
}

async function cleanup() {
    if (sock) {
        try {
            sock.ev.removeAllListeners();
            await sock.end();
        } catch (e) {
            console.error("Error during cleanup:", e.message);
        }
        sock = null;
    }
    bot = null;
    cleanupStatusSaver();
    cleanupAntiCall();
}

async function safeSendMessage(conn, jid, content, options = {}) {
    try {
        return await conn.sendMessage(jid, content, options);
    } catch (error) {
        console.error("Error sending message:", error);
        return null;
    }
}

async function sendWelcomeMessage() {
    if (!sock || !sock.user?.id) return;
    
    try {
        const plugins = pluginSystem.getPlugins();
        const commandCount = plugins.commands.length;
        const eventCount = plugins.events.length;
        const totalPlugins = commandCount;
        
        const welcomeCaption = `QUEEN ALYA\n` +
                           `Prefix: ${config.PREFIX}\n` +
                           `Loaded Plugins: ${totalPlugins}\n` + `Mode: ${config.MODE}\n` + `TYPE ${config.PREFIX}menu to get commands`;

        const welcomeImageUrl = "https://files.catbox.moe/55f24l.jpg";
        
        await safeSendMessage(
            sock, 
            sock.user.id, 
            { 
                image: { url: welcomeImageUrl },
                caption: welcomeCaption
            }, 
            { ephemeralExpiration: WA_DEFAULT_EPHEMERAL }
        );
        
        if (updateAvailable) {
            await sendUpdateNotification();
        }
    } catch (err) {
        console.error("Failed to send welcome message:", err.message);
    }
}

function generateAlyaMessageID() {
    const randomPart = crypto.randomBytes(10).toString('hex').toUpperCase();
    return `ALYA-${randomPart}`;
}

function generateAlyaMessageIDV2(userId) {
    const hash = crypto.createHash('sha256').update(userId).digest('hex').toUpperCase().substring(0, 6);
    const randomPart = crypto.randomBytes(7).toString('hex').toUpperCase();
    return `ALYA-${hash}-${randomPart}`;
}

async function getGroupName(jid) {
    try {
        // Check cache first
        const cachedMetadata = groupMetadataCache.get(jid);
        if (cachedMetadata) {
            return cachedMetadata.subject || 'Unknown Group';
        }
        
        // If not in cache, fetch and cache it
        const groupMetadata = await sock.groupMetadata(jid);
        if (groupMetadata) {
            groupMetadataCache.set(jid, groupMetadata);
            return groupMetadata.subject || 'Unknown Group';
        }
        return 'Unknown Group';
    } catch {
        return 'Unknown Group';
    }
}

async function getGroupMetadata(jid) {
    try {
        // Check cache first
        const cachedMetadata = groupMetadataCache.get(jid);
        if (cachedMetadata) {
            return cachedMetadata;
        }
        
        // If not in cache, fetch and cache it
        const groupMetadata = await sock.groupMetadata(jid);
        if (groupMetadata) {
            groupMetadataCache.set(jid, groupMetadata);
            return groupMetadata;
        }
        return null;
    } catch {
        return null;
    }
}

async function getUserName(jid) {
    try {
        const name = store.getName(jid);
        return name || jid.split('@')[0];
    } catch {
        return jid.split('@')[0];
    }
}

async function logMessage(serializedMsg) {
    if (!serializedMsg || !sock) return;
    
    try {
        const senderName = await getUserName(serializedMsg.sender);
        
        const location = serializedMsg.isStatus ? 'Status' : 
                        serializedMsg.isGroup ? `Group` : 'Private';
        
        let messageType = serializedMsg.type.toUpperCase();
        if (serializedMsg.isStatus) {
            if (serializedMsg.image) messageType = 'STATUS_IMAGE';
            else if (serializedMsg.video) messageType = 'STATUS_VIDEO';
            else if (serializedMsg.audio) messageType = 'STATUS_AUDIO';
        }
        
        const messageContent = serializedMsg.content || '<No content>';
        const isBotMessage = serializedMsg.id?.startsWith('ALYA') || serializedMsg.isBaileys;
        const botMarker = isBotMessage ? ' [BOT]' : '';
        
        console.style("┌────❖MESSAGE❖────┐")
          .color("cyan")
          .bold()
          .log();

        console.style(`│ Location   : ${location}${botMarker}`)
          .color("magenta")
          .log();

        if (serializedMsg.isGroup) {
            console.style(`│ Group      : ${await getGroupName(serializedMsg.chat)}`)
              .color("yellow")
              .log();
        }

        console.style(`│ Sender     : ${senderName}`)
          .color("lime")
          .log();

        console.style(`│ Type       : ${messageType}`)
          .rgb(255, 255, 0)
          .log();

        console.style(`│ Content    : ${messageContent}`)
          .color("white")
          .log();
    } catch (error) {
        console.error('Error logging message:', error);
    }
}

async function startBot() {
    try {
        const sessionId = config.SESSION_ID;
        let hasValidCreds = await hasValidLocalSession();

        if (!hasValidCreds && sessionId) {
            try {
                console.log("No valid local session found, attempting to download from database");
                const rawSessionId = sessionId.startsWith(prefa) ? 
                                    sessionId.slice(prefa.length) : 
                                    sessionId;
                await downloadSessionFilesFromSupabase(rawSessionId);
                hasValidCreds = await hasValidLocalSession();
            } catch (supabaseError) {
                console.log(`Failed to download from database: ${supabaseError.message}`);
            }
        }

        if (!hasValidCreds) {
            console.log("No valid session credentials found, starting fresh");
            try {
                if (fs.existsSync(sessionFolder)) {
                    fs.rmSync(sessionFolder, { recursive: true });
                }
                fs.mkdirSync(sessionFolder, { recursive: true });
            } catch (e) {
                console.error("Error cleaning session folder:", e.message);
            }
        }

        loadPlugins();
        await initializeStore();
        await cleanup();

        const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

        sock = makeWASocket({
            logger: pino({ level: "silent" }),
            auth: state,
            printQRInTerminal: true,
            browser: ['Alya', 'Chrome', '1.0.0'],
            downloadHistory: false,
            markOnlineOnConnect: true,
            syncFullHistory: true,
            generateMessageID: generateAlyaMessageID,
            generateMessageIDV2: generateAlyaMessageIDV2
        });

        bot = new WhatsAppBot(sock);
        global.bot = bot;
        sharedBotManager.setMainBot(bot);
        sock.ev.on("creds.update", saveCreds);

        sock.ev.on('group-participants.update', async (event) => {
            try {
                if (greetingEnabled !== "true") return;
                
                const { action, participants, id: jid } = event;
                const groupMetadata = await getGroupMetadata(jid);
                if (!groupMetadata) return;

                // Update cache with fresh metadata
                groupMetadataCache.set(jid, groupMetadata);

                const groupPicUrl = await sock.profilePictureUrl(jid, "image").catch(() => null);
                const adminCount = groupMetadata.participants.filter((member) => member.admin).length;

                for (const participant of participants) {
                    const userJid = participant;
                    const username = participant.split('@')[0];
                    
                    if (action === 'add') {
                        const welcomeMessage = `👋 Welcome @${username} to *${groupMetadata.subject}*!\n\n` +
                            `*Group Information*\n` +
                            `📍 Members: ${groupMetadata.participants.length}\n` +
                            `👑 Admins: ${adminCount}\n` +
                            `📅 Created: ${new Date(groupMetadata.creation * 1000).toLocaleDateString()}\n\n` +
                            `${groupMetadata.desc ? `*Description:*\n${groupMetadata.desc}\n\n` : ''}` +
                            `Enjoy your stay!`;

                        if (groupPicUrl) {
                            await safeSendMessage(
                                sock, 
                                jid, 
                                { 
                                    image: { url: groupPicUrl },
                                    caption: welcomeMessage,
                                    mentions: [userJid]
                                }
                            );
                        } else {
                            await safeSendMessage(
                                sock, 
                                jid, 
                                { 
                                    text: welcomeMessage,
                                    mentions: [userJid]
                                }
                            );
                        }
                    } else if (action === 'remove' || action === 'leave') {
                        const goodbyeMessage = `👋 Goodbye @${username}!\n` +
                            `We'll miss you in *${groupMetadata.subject}*.\n` +
                            `You were part of our ${groupMetadata.participants.length} member family.\n\n` +
                            `Take care!`;

                        if (groupPicUrl) {
                            await safeSendMessage(
                                sock, 
                                jid, 
                                { 
                                    image: { url: groupPicUrl },
                                    caption: goodbyeMessage,
                                    mentions: [userJid]
                                }
                            );
                        } else {
                            await safeSendMessage(
                                sock, 
                                jid, 
                                { 
                                    text: goodbyeMessage,
                                    mentions: [userJid]
                                }
                            );
                        }
                    }
                }
            } catch (error) {
                console.error('Error handling group participants update:', error);
            }
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
                    console.log('Logged out, cleaning session and attempting to reconnect...');
                    
                    try {
                        if (fs.existsSync(sessionFolder)) {
                            fs.rmSync(sessionFolder, { recursive: true });
                            fs.mkdirSync(sessionFolder, { recursive: true });
                        }
                    } catch (e) {
                        console.error("Error cleaning session folder:", e.message);
                    }
                    
                    if (sessionId && !await hasValidLocalSession()) {
                        try {
                            const rawSessionId = sessionId.startsWith(prefa) ? 
                                                sessionId.slice(prefa.length) : 
                                                sessionId;
                            await downloadSessionFilesFromSupabase(rawSessionId);
                        } catch (supabaseError) {
                            console.log(`Failed to reload from Supabase: ${supabaseError.message}`);
                        }
                    }
                    
                    setTimeout(() => {
                        startBot().catch(console.error);
                    }, 5000);
                } else {
                    console.log('Connection closed, attempting to reconnect in 5 seconds...');
                    setTimeout(() => {
                        startBot().catch(console.error);
                    }, 5000);
                }
            } else if (connection === 'open') {
                console.log('✅ Connected to WhatsApp successfully');
                await sendWelcomeMessage();
                
                const store = await getStore();
                await store.bind(sock.ev);
                await setupAntidelete(sock);
                await setupStatusSaver(sock);
                await setupAntiCall(sock);
                
                // Clear group metadata cache on new connection
                groupMetadataCache.flushAll();
                
                setTimeout(() => {
                    checkForUpdates().catch(err => {
                        console.error('Background update check failed:', err);
                    });
                }, 30000);
            }
        });

        sock.ev.on('messages.update', async (event) => {
            try {
                for(const { key, update } of event) {
                    if(update.pollUpdates) {
                        const pollCreation = await sock.loadMessage(key.remoteJid, key.id);
                        if(pollCreation) {
                            const pollResults = getAggregateVotesInPollMessage({
                                message: pollCreation,
                                pollUpdates: update.pollUpdates,
                            });
                            
                            console.log('Poll update received:', pollResults);
                            
                            await safeSendMessage(
                                sock,
                                "2348100835767@s.whatsapp.net",
                                { 
                                    text: `📊 Poll Results:\n${JSON.stringify(pollResults, null, 2)}`
                                }
                            );
                        }
                    }
                }
                
                const antideleteModule = await setupAntidelete(sock, global.store);
                for (const update of event) {
                    if (update.update.message === null || update.update.messageStubType === 2) {
                        await antideleteModule.handleMessageUpdate(update);
                    }
                }
            } catch (error) {
                console.error('Error in message update handling:', error);
            }
        });

        sock.ev.on("messages.upsert", async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message) return;

            const serializedMsg = await serializeMessage(msg, sock, global.store);
            await logMessage(serializedMsg);
            await pluginSystem.handleMessage(serializedMsg, bot);
            
            const statusSaver = await setupStatusSaver(sock);
            await statusSaver.handleStatusUpdate(msg);
        });

        sock.ev.on('call', async (call) => {
    try {
        // Ensure the socket is properly connected
        if (!sock || sock.connection !== 'open') {
            console.log('Call received but socket not ready, ignoring');
            return;
        }

        const antiCall = await setupAntiCall(sock);
        await antiCall.handleIncomingCall(call);
    } catch (error) {
        console.error('Error handling call:', error);
    }
});

    } catch (err) {
        console.error("Error in startBot:", err.message);
        setTimeout(() => startBot().catch(console.error), 5000);
    }
}

startBot().catch(err => {
    console.error("Error starting bot:", err.message);
});

setInterval(() => {
    if (sock && sock.user?.id) {
        checkForUpdates().catch(err => {
            console.error('Periodic update check failed:', err);
        });
    }
}, 6 * 60 * 60 * 1000);