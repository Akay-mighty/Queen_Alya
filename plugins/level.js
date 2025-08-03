const bot = require("../lib/plugin");
const mongoose = require('mongoose');
const config = require("../config");
const fs = require('fs');
const path = require('path');
const { resolveLidToJid } = require("../lib/serialize");

// Level system state
const levelState = {
    configFile: path.join(__dirname, '..', 'config.js'),
    levelSystemEnabled: config.LEVEL_UP === "true",
    mongoConnected: false
};

// File watcher to reload config changes
fs.watch(levelState.configFile, (eventType, filename) => {
    if (eventType === 'change') {
        try {
            delete require.cache[require.resolve(levelState.configFile)];
            const newConfig = require(levelState.configFile);
            levelState.levelSystemEnabled = newConfig.LEVEL_UP === "true";
            console.log('Level: Config reloaded. Level system is now', 
                levelState.levelSystemEnabled ? 'ENABLED' : 'DISABLED');
        } catch (error) {
            console.error('Level: Error reloading config:', error);
        }
    }
});

// Function to update config
function updateConfig(newValues) {
    try {
        const config = require(levelState.configFile);
        const updatedConfig = {...config, ...newValues};
        fs.writeFileSync(levelState.configFile, `module.exports = ${JSON.stringify(updatedConfig, null, 2)};`);
        delete require.cache[require.resolve(levelState.configFile)];
        levelState.levelSystemEnabled = updatedConfig.LEVEL_UP === "true";
        console.log('Level: Config updated. Level system is now', 
            levelState.levelSystemEnabled ? 'ENABLED' : 'DISABLED');
        return true;
    } catch (error) {
        console.error('Level: Error updating config:', error);
        return false;
    }
}

// Mongoose schema for user levels
const userLevelSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    chatId: { type: String, required: true },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 0 },
    lastMessageCount: { type: Number, default: 0 }
}, { timestamps: true });

// Create compound index for faster queries
userLevelSchema.index({ userId: 1, chatId: 1 }, { unique: true });

const UserLevel = mongoose.models.UserLevel || mongoose.model('UserLevel', userLevelSchema);

// Initialize MongoDB connection if configured
async function initializeMongoDB() {
    if (!config.MONGODB) {
        console.error('MongoDB connection URL not configured. Level system will not work properly.');
        levelState.mongoConnected = false;
        return;
    }

    try {
        await mongoose.connect(config.MONGODB);
        levelState.mongoConnected = true;
        console.log('Connected to MongoDB for level system');
    } catch (error) {
        levelState.mongoConnected = false;
        console.error('Error connecting to MongoDB:', error);
    }
}

initializeMongoDB();

// Level roles mapping
const LEVEL_ROLES = {
    1: "👨│Citizen",
    2: "👼Baby Wizard",
    3: "🧙‍♂️Wizard",
    4: "🧙‍♀️Wizard Lord",
    5: "🧚‍♂️Baby Mage",
    6: "🧛Mage",
    7: "🧛‍♀️Master of Mage",
    8: "👶Child of Noble",
    9: "🫅Noble",
    10: "🏃Speed of Elite",
    11: "👑Elite",
    12: "🎖️Ace I",
    13: "🏅Ace II",
    14: "🎗️Ace Master",
    15: "🎯Ace Dominator",
    16: "👔Ace Elite",
    17: "👕Ace Supreme",
    18: "🫂Supreme I",
    19: "🫃Supreme Ii",
    20: "🪢Supreme Master",
    21: "🪪Legend III",
    22: "👓Legend II",
    23: "🏆Legend",
    30: "🪙Immortal",
    40: "GOD🫰"
};

// Helper function to get role based on level
function getRole(level) {
    level = Number(level);
    if (level === 0) return "Newbie";
    
    const sortedLevels = Object.keys(LEVEL_ROLES)
        .map(Number)
        .sort((a, b) => b - a);
    
    for (const threshold of sortedLevels) {
        if (level >= threshold) {
            return LEVEL_ROLES[threshold];
        }
    }
    
    return "GOD🫰";
}

// Get user info using resolveLidToJid and store.getname
async function getUserInfo(sock, userId) {
    try {
        const jid = await resolveLidToJid(sock, userId);
        if (!jid) throw new Error('Could not resolve JID');
        
        const name = await store.getname(jid);
        if (!name) throw new Error('Could not get name');
        
        return { jid, name };
    } catch (error) {
        console.error('Error getting user info:', error);
        throw error; // We want to handle this in the calling functions
    }
}

// Calculate XP based on message count (5 XP per message)
async function calculateXP(sock, userId, chatId) {
    try {
        if (!chatId.endsWith('@g.us')) return 0; // Only work in groups
        
        const { jid } = await getUserInfo(sock, userId);
        const chatHistory = await store.getChatHistory(chatId);
        if (!chatHistory?.length) return 0;

        let messageCount = 0;
        for (const entry of chatHistory) {
            let msg;
            
            if (typeof entry.message === 'string') {
                try {
                    msg = JSON.parse(entry.message);
                } catch {
                    continue;
                }
            } else {
                msg = entry.message;
            }

            if (!msg) continue;
            if (msg.key?.fromMe) continue;
            
            const participant = msg.key.participant || msg.key.remoteJid;
            if (!participant) continue;
            
            const normalizedParticipant = participant.split('@')[0] + '@s.whatsapp.net';
            if (normalizedParticipant === jid) {
                messageCount++;
            }
        }
        return messageCount * 5; // 5 XP per message
    } catch (error) {
        console.error('Error calculating XP:', error);
        return 0;
    }
}

// Update or create user level
async function updateUserLevel(userId, chatId, xp) {
    try {
        if (!chatId.endsWith('@g.us')) return null; // Only work in groups
        
        const level = Math.floor(xp / 100); // 100 XP per level (20 messages)
        
        const userLevel = await UserLevel.findOneAndUpdate(
            { userId, chatId },
            { $set: { xp, level, lastMessageCount: xp } },
            { upsert: true, new: true }
        );
        
        return userLevel;
    } catch (error) {
        console.error('Error updating user level:', error);
        return null;
    }
}

// Get user level
async function getUserLevel(userId, chatId) {
    try {
        if (!chatId.endsWith('@g.us')) return null; // Only work in groups
        
        const userLevel = await UserLevel.findOne({ userId, chatId });
        return userLevel || { xp: 0, level: 0, lastMessageCount: 0 };
    } catch (error) {
        console.error('Error getting user level:', error);
        return { xp: 0, level: 0, lastMessageCount: 0 };
    }
}

// Get leaderboard for a chat
async function getLeaderboard(chatId, limit = 5) {
    try {
        if (!chatId.endsWith('@g.us')) return []; // Only work in groups
        
        const leaderboard = await UserLevel.find({ chatId })
            .sort({ xp: -1 })
            .limit(limit);
            
        return leaderboard;
    } catch (error) {
        console.error('Error getting leaderboard:', error);
        return [];
    }
}

// Get group metadata
async function getGroupMetadata(sock, groupJid) {
    try {
        const metadata = await sock.groupMetadata(groupJid);
        return metadata.subject || 'this chat';
    } catch (error) {
        console.error('Error getting group metadata:', error);
        return 'this chat';
    }
}

bot(
    {
        name: "level",
        info: "Manage level system settings",
        category: "level",
        usage: [
            "level on/off - Toggle level system",
            "level profile [@user] - Show user profile",
            "level rank [@user] - Show user rank",
            "level leaderboard - Show top users"
        ]
    },
    async (message, bot) => {
        // Check MongoDB connection first
        if (!levelState.mongoConnected) {
            return await bot.reply(
                "⚠️ MongoDB connection is not available.\n" +
                "Please check:\n" +
                "1. If MONGODB is configured in config.js\n" +
                "2. If the MongoDB server is running\n" +
                "3. If the connection URL is correct"
            );
        }

        // Only work in groups
        if (!message.chat.endsWith('@g.us')) {
            return await bot.reply("Level commands only work in groups!");
        }

        const query = message.query?.trim() || '';
        const [action, ...rest] = query.split(' ');

        try {
            switch (action?.toLowerCase()) {
                case 'on':
                    if (levelState.levelSystemEnabled) {
                        return await bot.reply("Level system is already enabled.");
                    }
                    const onSuccess = updateConfig({ LEVEL_UP: "true" });
                    return await bot.reply(
                        onSuccess 
                            ? "✅ Level system has been enabled." 
                            : "❌ Failed to enable level system."
                    );
                    
                case 'off':
                    if (!levelState.levelSystemEnabled) {
                        return await bot.reply("Level system is already disabled.");
                    }
                    const offSuccess = updateConfig({ LEVEL_UP: "false" });
                    return await bot.reply(
                        offSuccess 
                            ? "✅ Level system has been disabled." 
                            : "❌ Failed to disable level system."
                    );
                    
                case 'profile':
                    try {
                        const profileUser = message.mentionedJid?.[0] || message.sender;
                        const { name: profileName, jid: profileJid } = await getUserInfo(bot.sock, profileUser);
                        const messageCount = await calculateXP(bot.sock, profileUser, message.chat);
                        const userLevel = await updateUserLevel(profileUser, message.chat, messageCount);
                        const role = getRole(userLevel?.level || 0);

                        const profile = `
*👤 Profile of ${profileName}*

🧩 *Role:* ${role}
🍁 *Level:* ${userLevel?.level || 0}
📥 *Total Messages:* ${Math.floor(messageCount / 5)}
📊 *XP:* ${userLevel?.xp || 0} / ${((userLevel?.level || 0) + 1) * 100}

*Powered by ${config.BOT_NAME}*`;

                        try {
                            const pfp = await bot.sock.profilePictureUrl(profileJid, "image");
                            return await bot.sock.sendMessage(message.chat, { 
                                image: { url: pfp },
                                caption: profile 
                            }, { quoted: message });
                        } catch {
                            return await bot.reply(profile);
                        }
                    } catch (error) {
                        console.error('Profile command error:', error);
                        return await bot.reply("❌ Could not fetch user profile. Please try again.");
                    }
                    
                case 'rank':
                    try {
                        const rankUser = message.mentionedJid?.[0] || message.sender;
                        const { name: rankName, jid: rankJid } = await getUserInfo(bot.sock, rankUser);
                        const rankMessageCount = await calculateXP(bot.sock, rankUser, message.chat);
                        const rankUserLevel = await updateUserLevel(rankUser, message.chat, rankMessageCount);
                        const rankRole = getRole(rankUserLevel?.level || 0);
                        const disc = rankJid.substring(3, 7);

                        const rankText = `*🏆 ${rankName}✧${disc}'s Rank* 🏆\n\n` +
                            `🧩 *Role:* ${rankRole}\n` +
                            `📊 *XP:* ${rankMessageCount} / ${((rankUserLevel?.level || 0) + 1) * 100}\n` +
                            `🍁 *Level:* ${rankUserLevel?.level || 0}\n` +
                            `📥 *Messages:* ${Math.floor(rankMessageCount / 5)}`;

                        try {
                            const pfp = await bot.sock.profilePictureUrl(rankJid, "image");
                            return await bot.sock.sendMessage(message.chat, { 
                                image: { url: pfp },
                                caption: rankText
                            }, { quoted: message });
                        } catch {
                            return await bot.reply(rankText);
                        }
                    } catch (error) {
                        console.error('Rank command error:', error);
                        return await bot.reply("❌ Could not fetch user rank. Please try again.");
                    }
                    
                case 'leaderboard':
                case 'deck':
                    try {
                        const leaderboard = await getLeaderboard(message.chat, 5);
                        if (!leaderboard.length) {
                            return await bot.reply("No level data available for this chat yet.");
                        }

                        const groupName = await getGroupMetadata(bot.sock, message.chat);
                        let leaderboardText = `*🏆 Leaderboard for ${groupName}* 🏆\n\n`;
                        
                        for (let i = 0; i < leaderboard.length; i++) {
                            const user = leaderboard[i];
                            const { name } = await getUserInfo(bot.sock, user.userId);
                            const role = getRole(user.level);
                            
                            leaderboardText += `*${i + 1}.* ${name}\n` +
                                `   🧩 Level: ${user.level} | ${role}\n` +
                                `   📊 XP: ${user.xp} (${Math.floor(user.xp / 5)} msgs)\n\n`;
                        }

                        return await bot.reply(leaderboardText);
                    } catch (error) {
                        console.error('Leaderboard command error:', error);
                        return await bot.reply("❌ Could not fetch leaderboard. Please try again.");
                    }
                
                case 'status':
                default:
                    const groupNameStatus = await getGroupMetadata(bot.sock, message.chat);
                    return await bot.reply(
                        `*📜 Level System - ${groupNameStatus}*\n\n` +
                        `*🔹 Status*\n` +
                        `- System: ${levelState.levelSystemEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                        `- MongoDB: ${levelState.mongoConnected ? '✅ Connected' : '❌ Disconnected'}\n\n` +
                        `*🔹 XP System*\n` +
                        `- XP per message: 5\n` +
                        `- XP per level: 100 (20 messages)\n` +
                        `- Total roles: ${Object.keys(LEVEL_ROLES).length}\n\n` +
                        `*📌 Usage*\n` +
                        `🔹 ${config.PREFIX}level on/off - Toggle system\n` +
                        `🔹 ${config.PREFIX}level profile [@user] - Show profile\n` +
                        `🔹 ${config.PREFIX}level rank [@user] - Show rank\n` +
                        `🔹 ${config.PREFIX}level leaderboard - Top users`
                    );
            }
        } catch (error) {
            console.error('Level command error:', error);
            return await bot.reply("❌ An error occurred while processing your request.");
        }
    }
);

// Text listener for XP gain
bot(
    {
        on: 'text',
        name: "level-listener",
        ignoreRestrictions: true
    },
    async (message, bot) => {
        try {
            // Check if system should process this message
            if (!levelState.mongoConnected || 
                !levelState.levelSystemEnabled || 
                message.key?.fromMe || 
                !message.chat.endsWith('@g.us')) {
                return;
            }
            
            // Get current user data
            const currentUser = await getUserLevel(message.sender, message.chat);
            const messageCount = await calculateXP(bot.sock, message.sender, message.chat);
            
            // Only update if there's a significant change (prevent spamming)
            if (messageCount > currentUser.lastMessageCount) {
                const updatedUser = await updateUserLevel(message.sender, message.chat, messageCount);
                
                // Check for level up
                if (updatedUser && updatedUser.level > currentUser.level) {
                    const { name } = await getUserInfo(bot.sock, message.sender);
                    const role = getRole(updatedUser.level);
                    
                    await bot.sock.sendMessage(message.chat, {
                        text: `╭─────────────────────────────╮\n` +
                              `│        🎉 *LEVEL UP!* 🎉\n` +
                              `├─────────────────────────────┤\n` +
                              `│ *User:* ${name}\n` +
                              `│ *New Level:* ${updatedUser.level}\n` +
                              `│ *New Role:* ${role}\n` +
                              `│ *XP Progress:* ${updatedUser.xp}/${(updatedUser.level + 1) * 100}\n` +
                              `╰─────────────────────────────╯\n` +
                              `Congratulations on your achievement!`
                    }, { quoted: message });
                }
            }
        } catch (error) {
            console.error('Level listener error:', error);
        }
    }
);