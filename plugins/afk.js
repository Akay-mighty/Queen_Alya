const bot = require("../lib/plugin");
const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, '../config.js');
const config = require('../config');

// AFK data storage
const afkUsers = {};

// Watch for config file changes
fs.watch(configPath, (eventType, filename) => {
    if (eventType === 'change') {
        try {
            delete require.cache[require.resolve('../config')];
            const newConfig = require('../config');
            Object.assign(config, newConfig);
            console.log('Config file reloaded');
        } catch (err) {
            console.error('Error reloading config:', err);
        }
    }
});

// AFK command handler
bot(
    {
        name: 'afk',
        desc: 'Set AFK status with optional reason',
        usage: 'afk | reason'
    },
    async (message, bot) => {
        if (!message.chat.endsWith('@g.us') || message.chat.endsWith('@newsletter')) {
            return await bot.reply('AFK mode only works in groups');
        }

        const [_, reason] = message.text.split('|').map(s => s.trim());
        const afkReason = reason || config.AFK_REASON;
        const userId = message.sender;

        afkUsers[userId] = {
            startTime: Date.now(),
            reason: afkReason,
            chat: message.chat
        };

        // Update config if AFK was off
        if (config.AFK === "false") {
            updateConfig('AFK', 'true');
            if (reason) updateConfig('AFK_REASON', afkReason);
        }

        await bot.reply(`AFK mode activated. Reason: ${afkReason}`);
    }
);

// Message handler for AFK responses
bot(
    {
        on: 'text',
        fromMe: false,
    },
    async (message, bot) => {
        if (!config.AFK || config.AFK === "false") return;
        if (!message.chat.endsWith('@g.us') || message.chat.endsWith('@newsletter')) return;

        const userId = message.sender;
        const mentionedUsers = message.mentionedJid || [];

        // Check if user is returning from AFK
        if (afkUsers[userId] && afkUsers[userId].chat === message.chat) {
            const afkData = afkUsers[userId];
            const duration = formatDuration(Date.now() - afkData.startTime);
            
            delete afkUsers[userId];
            await bot.reply(`Welcome back ${message.pushName}! You were AFK for ${duration}.`);
            return;
        }

        // Check if any mentioned users are AFK
        for (const mentionedId of mentionedUsers) {
            if (afkUsers[mentionedId] && afkUsers[mentionedId].chat === message.chat) {
                const afkData = afkUsers[mentionedId];
                const duration = formatDuration(Date.now() - afkData.startTime);
                
                await bot.reply(
                    `@${mentionedId.split('@')[0]} is AFK (for ${duration}). Reason: ${afkData.reason}`,
                    { mentions: [mentionedId] }
                );
            }
        }
    }
);

// Helper function to update config.js
function updateConfig(key, value) {
    try {
        let configContent = fs.readFileSync(configPath, 'utf8');
        const regex = new RegExp(`(${key}:\\s*")([^"]*)(")`);
        configContent = configContent.replace(regex, `$1${value}$3`);
        fs.writeFileSync(configPath, configContent);
        console.log(`Updated config: ${key} = ${value}`);
    } catch (err) {
        console.error('Error updating config:', err);
    }
}

// Helper function to format duration
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}