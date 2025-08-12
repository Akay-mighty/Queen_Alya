const bot = require("../lib/plugin");
const { downloadContentFromMessage, jidNormalizedUser } = require("baileys");
const fs = require('fs');
const path = require('path');
const config = require('../config');
const configPath = path.join(__dirname, '..', 'config.js');
const { serializeMessage, normalizeJid } = require('../lib/serialize');

// Helper function to convert string to boolean
function toBoolean(str) {
    return str === "true" || str === true;
}

// Initialize config objects
let autoStatusConfig = {
    currentMode: toBoolean(config.AUTO_STATUS) ? "react" : "off",
    reactEmoji: config.AUTO_STATUS_EMOJI || "✨"
};

// File watcher setup
let configWatcher;

function setupConfigWatcher() {
    if (configWatcher) {
        configWatcher.close();
    }

    configWatcher = fs.watch(configPath, (eventType) => {
        if (eventType === 'change') {
            // Clear require cache and reload config
            delete require.cache[require.resolve(configPath)];
            const newConfig = require(configPath);
            
            // Update configs
            autoStatusConfig.currentMode = toBoolean(newConfig.AUTO_STATUS) ? "react" : "off";
            autoStatusConfig.reactEmoji = newConfig.AUTO_STATUS_EMOJI || "✨";
        }
    });
}

// Initialize watcher
setupConfigWatcher();

// Function to update config file
async function updateConfig(updates) {
    try {
        // Read current config
        let configContent = fs.readFileSync(configPath, 'utf8');
        
        // Apply updates
        for (const [key, value] of Object.entries(updates)) {
            // Handle different patterns for different keys
            let regex;
            if (key === 'AUTO_STATUS') {
                regex = new RegExp(`(${key}:\\s*")([^"]*)(")`);
            } else if (key === 'AUTO_STATUS_EMOJI') {
                regex = new RegExp(`(${key}:\\s*")([^"]*)(")`);
            }
            
            if (regex) {
                if (!regex.test(configContent)) {
                    // If the key doesn't exist, add it to the config object
                    const configObj = require(configPath);
                    configObj[key] = value;
                    configContent = `const config = ${JSON.stringify(configObj, null, 2)};\n\nmodule.exports = config;`;
                } else {
                    configContent = configContent.replace(regex, `$1${value}$3`);
                }
            }
        }
        
        // Write back to file
        fs.writeFileSync(configPath, configContent, 'utf8');
        
        // Manually update our configs since we're the ones making changes
        for (const [key, value] of Object.entries(updates)) {
            if (key === 'AUTO_STATUS') {
                autoStatusConfig.currentMode = toBoolean(value) ? "react" : "off";
            }
            if (key === 'AUTO_STATUS_EMOJI') {
                autoStatusConfig.reactEmoji = value;
            }
        }
        
        // Clear cache and reload config
        delete require.cache[require.resolve(configPath)];
        require(configPath);
        
        return true;
    } catch (error) {
        console.error('Error updating config:', error);
        return false;
    }
}

// Enhanced Status update handler for AutoStatus
bot(
    {
        on: 'status',
        name: "autostatus",
        ignoreRestrictions: true,
        fromMe: false // Process all status updates, not just from the bot
    },
    async (message, bot) => {
        try {
            if (!message.key || !message.key.remoteJid) return;
            
            // Skip if the status is from the bot itself
            const botJid = jidNormalizedUser(bot.sock.user.id);
            const senderJid = normalizeJid(message.key.participant || message.key.remoteJid);
            if (senderJid === botJid) return;

            // Process based on current mode
            switch (autoStatusConfig.currentMode) {
                case "on":
                    // Mark status as viewed
                    await bot.sock.readMessages([message.key]);
                    break;
                    
                case "react":
                    // Mark status as viewed
                    await bot.sock.readMessages([message.key]);
                    
                    // React to the status
                    await bot.sock.sendMessage(
                        message.key.remoteJid,
                        {
                            react: {
                                text: autoStatusConfig.reactEmoji,
                                key: message.key
                            }
                        }
                    );
                    break;
                    
                case "off":
                default:
                    // Do nothing
                    break;
            }
        } catch (error) {
            console.error('AutoStatus error:', error);
        }
    }
);

// Command handler for AutoStatus
bot(
    {
        pattern: "autostatus",
        name: "autostatus",
        info: "Control status viewing and reactions",
        category: "status",
        usage: [
            "autostatus on - View statuses",
            "autostatus react - View and react",
            "autostatus off - Disable",
            "autostatus emoji <emoji> - Change reaction emoji"
        ]
    },
    async (message, bot) => {
        const [command, ...args] = message.query?.toLowerCase().split(' ') || [];
        
        // Handle emoji change
        if (command === 'emoji' && args.length > 0) {
            const newEmoji = args[0].trim();
            const success = await updateConfig({ AUTO_STATUS_EMOJI: newEmoji });
            
            if (success) {
                return bot.reply(`✅ Reaction emoji updated to: ${newEmoji}`);
            } else {
                return bot.reply('❌ Failed to update emoji. Check console for errors.');
            }
        }
        
        // Handle mode changes
        const validModes = ["on", "react", "off"];
        if (validModes.includes(command)) {
            const updates = {
                AUTO_STATUS: command !== 'off' ? "true" : "false"
            };
            
            if (command === 'react') {
                updates.AUTO_STATUS_EMOJI = autoStatusConfig.reactEmoji;
            }
            
            const success = await updateConfig(updates);
            
            if (success) {
                let replyText = `🔄 AutoStatus set to: *${command}*\n\n`;
                replyText += `• Viewing: ${command !== 'off' ? '✅' : '❌'}\n`;
                replyText += `• Reacting: ${command === 'react' ? '✅' : '❌'}`;
                
                if (command === 'react') {
                    replyText += `\n• Emoji: ${autoStatusConfig.reactEmoji}`;
                }
                
                return bot.reply(replyText);
            } else {
                return bot.reply('❌ Failed to update AutoStatus. Check console for errors.');
            }
        }

        // Show current status if no valid command specified
        let replyText = `📱 *AutoStatus*\n\n`;
        replyText += `Current Mode: *${autoStatusConfig.currentMode}*\n`;
        replyText += `Current Emoji: ${autoStatusConfig.reactEmoji}\n\n`;
        replyText += `⚙️ *Commands:*\n`;
        replyText += `• \`autostatus on\` - View statuses\n`;
        replyText += `• \`autostatus react\` - View + react\n`;
        replyText += `• \`autostatus off\` - Disable\n`;
        replyText += `• \`autostatus emoji <emoji>\` - Change reaction emoji`;
        
        return bot.reply(replyText);
    }
);

// Rest of your existing code (media save handler and sstatus command) remains the same...

// Cleanup watcher on process exit
process.on('exit', () => {
    if (configWatcher) {
        configWatcher.close();
    }
});