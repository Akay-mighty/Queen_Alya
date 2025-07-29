const bot = require("../lib/plugin");
const axios = require('axios');
const config = require("../config");
const sharedBotManager = require("../lib/sharedBotManager");

// Pair code command
bot(
    {
        name: "pair",
        info: "Get pair code for a WhatsApp number",
        category: "system",
        usage: "[number] or reply to a message"
    },
    async (message, bot) => {
        try {
            let number = message.query;
            
            // If no query but replied to a message, use the sender's number
            if (!number && message.quoted?.sender) {
                number = message.quoted.sender;
            }
            
            if (!number) {
                return await bot.reply(`Please provide a number or reply to a message.\nUsage: *${config.PREFIX}pair [number]*`);
            }
            
            // Clean the number (remove @s.whatsapp.net if present)
            const cleanNumber = number.replace(/@s\.whatsapp\.net$/, '').replace(/[^0-9]/g, '');
            
            if (cleanNumber.length < 11) {
                return await bot.reply("Invalid number format. Please include country code (e.g. 23481008xxxx)");
            }
            
            await bot.react('⏳');
            
            try {
                const response = await axios.get(`https://alya-pair-code.onrender.com/api/code?number=${cleanNumber}`);
                
                if (response.data?.code) {
                    await bot.reply(`🔑 *Pair Code for ${cleanNumber}*\n\n` +
                                  `CODE: *${response.data.code}*\n\n` +
                                  `This code expires in 60 seconds. Use it immediately.`);
                } else {
                    await bot.reply("Failed to get pair code. Please try again later.");
                }
            } catch (error) {
                console.error('Pair code error:', error);
                await bot.reply("Error getting pair code. Please try again later.");
            }
        } catch (error) {
            console.error('Pair command error:', error);
            await bot.reply("An error occurred while processing your request.");
        }
    }
);

// Share bot command
bot(
    {
        name: "sharebot",
        info: "Share a bot instance with another user",
        category: "system",
        usage: "session_id | participant_number",
        fromMe: true // Only bot owner can use this
    },
    async (message, bot) => {
        try {
            if (!message.isOwner()) {
                return await bot.reply("❌ This command is only available to the bot owner.");
            }
            
            const [sessionId, participantNumber] = message.query.split('|').map(s => s.trim());
            
            if (!sessionId || !participantNumber) {
                return await bot.reply(`Invalid format. Usage: *${config.PREFIX}sharebot session_id | participant_number*`);
            }
            
            await bot.react('⏳');
            
            try {
                // Initialize shared bot manager if not already done
                if (!sharedBotManager.mainBot) {
                    sharedBotManager.setMainBot(bot);
                }
                
                const result = await sharedBotManager.createSharedBot(sessionId, participantNumber);
                
                await bot.reply(`✅ *Bot Shared Successfully!*\n\n` +
                               `🔹 Session ID: *${result.sessionId}*\n` +
                               `🔹 Owner: *${result.ownerNumber}*\n\n` +
                               `The shared bot will now connect...`);
            } catch (error) {
                await bot.reply(`❌ Failed to share bot: ${error.message}`);
            }
        } catch (error) {
            console.error('Sharebot command error:', error);
            await bot.reply("An error occurred while processing your request.");
        }
    }
);

// List shared bots command
bot(
    {
        name: "listshare",
        info: "List all shared bot instances",
        category: "system",
        fromMe: true // Only bot owner can use this
    },
    async (message, bot) => {
        try {
            if (!message.isOwner()) {
                return await bot.reply("❌ This command is only available to the bot owner.");
            }
            
            const sharedBots = sharedBotManager.listSharedBots();
            
            if (sharedBots.length === 0) {
                return await bot.reply("No shared bots currently running.");
            }
            
            let reply = `👑 *Shared Bot Instances (${sharedBots.length}/2)*\n\n`;
            
            sharedBots.forEach((bot, index) => {
                reply += `🔹 *Instance ${index + 1}*\n` +
                         `   Session ID: ${bot.sessionId}\n` +
                         `   Owner: ${bot.ownerNumber}\n` +
                         `   Status: ${bot.status}\n\n`;
            });
            
            reply += `Use *${config.PREFIX}stopshare [session_id]* to stop a shared bot.`;
            
            await bot.reply(reply);
        } catch (error) {
            console.error('Listshare command error:', error);
            await bot.reply("An error occurred while listing shared bots.");
        }
    }
);

// Stop shared bot command
bot(
    {
        name: "stopshare",
        info: "Stop a shared bot instance",
        category: "system",
        usage: "[session_id]",
        fromMe: true // Only bot owner can use this
    },
    async (message, bot) => {
        try {
            if (!message.isOwner()) {
                return await bot.reply("❌ This command is only available to the bot owner.");
            }
            
            const sessionId = message.query.trim();
            
            if (!sessionId) {
                return await bot.reply(`Please provide a session ID.\nUsage: *${config.PREFIX}stopshare session_id*`);
            }
            
            try {
                const stopped = sharedBotManager.stopSharedBot(sessionId);
                
                if (stopped) {
                    await bot.reply(`✅ Successfully stopped shared bot with ID: *${sessionId}*`);
                } else {
                    await bot.reply(`❌ Failed to stop shared bot with ID: *${sessionId}*. It may not be running.`);
                }
            } catch (error) {
                await bot.reply(`❌ Error stopping shared bot: ${error.message}`);
            }
        } catch (error) {
            console.error('Stopshare command error:', error);
            await bot.reply("An error occurred while processing your request.");
        }
    }
);