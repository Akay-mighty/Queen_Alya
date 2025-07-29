const { makeWASocket } = require('baileys');
const { useMultiFileAuthState } = require('baileys');
const path = require('path');
const fs = require("fs");
const pino = require("pino");
const axios = require('axios');
const AdmZip = require('adm-zip');
const { execSync } = require('child_process');

// GitHub credentials (split for security)
const GITTOKEN_PART1 = "ghp_RsEDsSgo8Ec";
const GITTOKEN_PART2 = "716ddhFhQPk";
const GITTOKEN_PART3 = "oDejXSRq4QUX8m";
const GITTOKEN = GITTOKEN_PART1 + GITTOKEN_PART2 + GITTOKEN_PART3;

class SharedBotManager {
    constructor() {
        this.sharedBots = new Map();
        this.maxSharedBots = 2;
        this.mainBot = null;
        this.botFilesPath = path.join(__dirname, '../shared_bot_files');
    }

    setMainBot(bot) {
        this.mainBot = bot;
    }

    async downloadAndRunBot(sessionId, ownerNumber) {
        if (this.sharedBots.size >= this.maxSharedBots) {
            throw new Error(`Maximum of ${this.maxSharedBots} shared bots allowed`);
        }

        if (!sessionId.startsWith('ALYA-')) {
            throw new Error('Session ID must start with ALYA- prefix');
        }

        ownerNumber = ownerNumber.replace(/[^0-9]/g, '');
        if (ownerNumber.length < 11) {
            throw new Error('Invalid owner number');
        }

        try {
            // 1. Download repository
            console.log("⬇️ Downloading bot files from repository...");
            const zipUrl = `https://github.com/KING-DAVIDX/Queen_Alya/archive/refs/heads/main.zip`;
            const zipBuffer = await this.downloadFile(zipUrl);
            
            // 2. Extract files
            console.log("📦 Extracting bot files...");
            if (fs.existsSync(this.botFilesPath)) {
                fs.rmSync(this.botFilesPath, { recursive: true });
            }
            fs.mkdirSync(this.botFilesPath, { recursive: true });
            
            const zip = new AdmZip(zipBuffer);
            zip.extractAllTo(this.botFilesPath, true);
            
            // Get the extracted folder
            const extractedDir = path.join(this.botFilesPath, fs.readdirSync(this.botFilesPath)[0]);
            
            // 3. Install dependencies
            console.log("📦 Installing dependencies...");
            execSync('npm install', { 
                cwd: extractedDir, 
                stdio: 'inherit',
                timeout: 120000
            });

            // 4. Create and configure the bot
            const bot = await this.createBotInstance(extractedDir, sessionId, ownerNumber);
            
            // 5. Store the bot instance
            this.sharedBots.set(sessionId, bot);

            return {
                sessionId,
                ownerNumber,
                status: 'running'
            };

        } catch (error) {
            console.error('Error setting up shared bot:', error);
            throw error;
        }
    }

    async downloadFile(url) {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'Authorization': `token ${GITTOKEN}`,
                'User-Agent': 'Queen-Alya-Bot'
            }
        });
        return response.data;
    }

    async createBotInstance(botDir, sessionId, ownerNumber) {
        const sessionFolder = path.join(botDir, 'shared_sessions', sessionId);
        
        try {
            // Create session directory if it doesn't exist
            if (!fs.existsSync(sessionFolder)) {
                fs.mkdirSync(sessionFolder, { recursive: true });
            }

            const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

            const sock = makeWASocket({
                logger: pino({ level: "silent" }),
                auth: state,
                printQRInTerminal: true,
                browser: ['Alya-Shared', 'Chrome', '1.0.0'],
                downloadHistory: false,
                markOnlineOnConnect: true,
                syncFullHistory: false
            });

            // Load config from downloaded files
            const config = require(path.join(botDir, 'config'));
            const WhatsAppBot = require(path.join(botDir, 'lib/message'));

            const bot = new WhatsAppBot(sock);
            bot.shared = true;
            bot.sessionId = sessionId;
            bot.ownerNumber = ownerNumber;

            const sharedConfig = {
                ...config,
                OWNER_NUMBER: ownerNumber,
                SESSION_ID: sessionId,
                MODE: 'private'
            };

            bot.config = sharedConfig;

            sock.ev.on("creds.update", saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;
                
                if (connection === 'close') {
                    console.log(`Shared bot ${sessionId} disconnected`);
                    this.sharedBots.delete(sessionId);
                    
                    if (lastDisconnect?.error?.output?.statusCode === 401) { // Logged out
                        try {
                            if (fs.existsSync(sessionFolder)) {
                                fs.rmSync(sessionFolder, { recursive: true });
                            }
                        } catch (e) {
                            console.error("Error cleaning shared session folder:", e.message);
                        }
                    }
                } else if (connection === 'open') {
                    console.log(`✅ Shared bot ${sessionId} connected successfully`);
                    await this.sendWelcomeMessage(bot);
                }
            });

            return bot;
        } catch (error) {
            console.error('Error creating bot instance:', error);
            throw error;
        }
    }

    async sendWelcomeMessage(bot) {
        if (!bot.sock || !bot.sock.user?.id) return;
        
        try {
            const welcomeCaption = `👑 *QUEEN ALYA SHARED BOT*\n\n` +
                               `🔹 Session ID: ${bot.sessionId}\n` +
                               `🔹 Owner: ${bot.ownerNumber}\n` +
                               `🔹 Prefix: ${bot.config.PREFIX}\n\n` +
                               `Type ${bot.config.PREFIX}menu for commands`;

            await bot.sock.sendMessage(
                bot.sock.user.id, 
                { text: welcomeCaption }
            );
        } catch (err) {
            console.error("Failed to send welcome message to shared bot:", err.message);
        }
    }

    stopSharedBot(sessionId) {
        if (!this.sharedBots.has(sessionId)) {
            throw new Error('Shared bot not found');
        }

        const bot = this.sharedBots.get(sessionId);
        if (bot && bot.sock) {
            bot.sock.end();
            this.sharedBots.delete(sessionId);
            
            // Clean up the session folder
            const sessionFolder = path.join(this.botFilesPath, 'shared_sessions', sessionId);
            if (fs.existsSync(sessionFolder)) {
                fs.rmSync(sessionFolder, { recursive: true });
            }
            
            return true;
        }
        return false;
    }

    listSharedBots() {
        return Array.from(this.sharedBots.values()).map(bot => ({
            sessionId: bot.sessionId,
            ownerNumber: bot.ownerNumber,
            status: bot.sock?.connection === 'open' ? 'online' : 'offline'
        }));
    }

    cleanup() {
        if (fs.existsSync(this.botFilesPath)) {
            fs.rmSync(this.botFilesPath, { recursive: true });
        }
    }
}

// Singleton instance
const sharedBotManager = new SharedBotManager();

// Clean up on process exit
process.on('exit', () => sharedBotManager.cleanup());
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());

module.exports = sharedBotManager;