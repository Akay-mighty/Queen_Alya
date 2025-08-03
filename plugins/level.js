const bot = require("../lib/plugin");
const mongoose = require('mongoose');
const config = require("../config");
const fs = require('fs');
const path = require('path');
const { resolveLidToJid } = require("../lib/serialize");

// Level system state
const levelState = {
    configFile: path.join(__dirname, '..', 'config.js'),
    levelSystemEnabled: config.LEVEL_UP === "true"
};

// File watcher to reload config changes
fs.watch(levelState.configFile, (eventType, filename) => {
    if (eventType === 'change') {
        try {
            delete require.cache[require.resolve(levelState.configFile)];
            const newConfig = require(levelState.configFile);
            levelState.levelSystemEnabled = newConfig.LEVEL_UP === "true";
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
if (config.MONGODB) {
    try {
        mongoose.connect(config.MONGODB, { 
            useNewUrlParser: true, 
            useUnifiedTopology: true 
        });
        console.log('Connected to MongoDB for level system');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
    }
}

// Level roles mapping
const LEVEL_ROLES = {
    2: "👨│Citizen",
    4: "👼Baby Wizard",
    6: "🧙‍♂️Wizard",
    8: "🧙‍♀️Wizard Lord",
    10: "🧚‍♂️Baby Mage",
    12: "🧛Mage",
    14: "🧛‍♀️Master of Mage",
    16: "👶Child of Noble",
    18: "🫅Noble",
    20: "🏃Speed of Elite",
    22: "👑Elite",
    24: "🎖️Ace I",
    26: "🏅Ace II",
    28: "🎗️Ace Master",
    30: "🎯Ace Dominator",
    32: "👔Ace Elite",
    34: "👕Ace Supreme",
    36: "🫂Supreme I",
    38: "🫃Supreme Ii",
    40: "🪢Supreme Master",
    42: "🪪Legend III",
    44: "👓Legend II",
    46: "🏆Legend",
    55: "🪙Immortal"
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

// Resolve LID to JID
async function resolveToJid(sock, lid) {
    try {
        if (lid.includes('@')) return lid; // Already a JID
        const jid = await resolveLidToJid(sock, lid);
        return jid || `${lid}@s.whatsapp.net`;
    } catch (error) {
        console.error('Error resolving JID:', error);
        return `${lid}@s.whatsapp.net`;
    }
}

// Calculate XP based on message count (1 XP per message)
async function calculateXP(sock, userId, chatId) {
    try {
        if (!chatId.endsWith('@g.us')) return 0; // Only work in groups
        
        const jid = await resolveToJid(sock, userId);
        const chatHistory = await store.getChatHistory(chatId);
        if (!chatHistory?.length) return 0;

        let messageCount = 0;
        for (const entry of chatHistory) {
            let msg;
            
            // Parse the message data if it's a string
            if (typeof entry.message === 'string') {
                try {
                    msg = JSON.parse(entry.message);
                } catch {
                    continue;
                }
            } else {
                msg = entry.message;
            }

            if (!msg || msg.key?.fromMe) continue;
            
            // Get participant correctly
            const participant = msg.key.participant || msg.key.remoteJid;
            if (!participant) continue;
            
            // Normalize participant ID
            const normalizedParticipant = participant.split('@')[0] + '@s.whatsapp.net';
            const targetUser = jid.includes('@') ? 
                jid.split('@')[0] + '@s.whatsapp.net' : 
                jid + '@s.whatsapp.net';

            if (normalizedParticipant === targetUser) {
                messageCount++;
            }
        }
        return messageCount;
    } catch (error) {
        console.error('Error calculating XP:', error);
        return 0;
    }
}

// Get user name 
async function getUserName(sock, userId) {
    try {
        const jid = await resolveToJid(sock, userId);
        const contact = await store.getContact(jid);
        return contact?.pushName || contact?.name || contact?.notify || jid.split('@')[0];
    } catch (error) {
        console.error('Error getting user name:', error);
        return userId.split('@')[0];
    }
}

// Update or create user level
async function updateUserLevel(userId, chatId, xp) {
    try {
        if (!chatId.endsWith('@g.us')) return null; // Only work in groups
        
        const level = Math.floor(xp / 100); // 100 XP per level (adjust as needed)
        
        const userLevel = await UserLevel.findOneAndUpdate(
            { userId, chatId },
            { $set: { xp, level } },
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
        return userLevel || { xp: 0, level: 0 };
    } catch (error) {
        console.error('Error getting user level:', error);
        return { xp: 0, level: 0 };
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
        if (!config.MONGODB) {
            return await bot.reply("MongoDB connection is not configured. Please set MONGODB in config.");
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
                    const onSuccess = updateConfig({ LEVEL_UP: "true" });
                    return await bot.reply(
                        onSuccess 
                            ? "Level system has been enabled." 
                            : "Failed to enable level system."
                    );
                    
                case 'off':
                    const offSuccess = updateConfig({ LEVEL_UP: "false" });
                    return await bot.reply(
                        offSuccess 
                            ? "Level system has been disabled." 
                            : "Failed to disable level system."
                    );
                    
                case 'profile':
                    const profileUser = message.mentionedJid?.[0] || message.sender;
                    const messageCount = await calculateXP(bot.sock, profileUser, message.chat);
                    const userLevel = await updateUserLevel(profileUser, message.chat, messageCount);
                    const name = await getUserName(bot.sock, profileUser);
                    const role = getRole(userLevel?.level || 0);

                    const profile = `
*Hii ${name},*
*Here is your profile information*
*👤Username:* ${name}
*🧩Role:* ${role}
*🍁Level:* ${userLevel?.level || 0}
*📥Total Messages:* ${messageCount}
*Powered by ${config.BOT_NAME}*
`;

                    try {
                        const jid = await resolveToJid(bot.sock, profileUser);
                        const pfp = await bot.sock.profilePictureUrl(jid, "image");
                        return await bot.sock.sendMessage(message.chat, { 
                            image: { url: pfp },
                            caption: profile 
                        }, { quoted: message });
                    } catch {
                        return await bot.reply(profile);
                    }
                    
                case 'rank':
                    const rankUser = message.mentionedJid?.[0] || message.sender;
                    const rankMessageCount = await calculateXP(bot.sock, rankUser, message.chat);
                    const rankUserLevel = await updateUserLevel(rankUser, message.chat, rankMessageCount);
                    const rankName = await getUserName(bot.sock, rankUser);
                    const rankRole = getRole(rankUserLevel?.level || 0);
                    const disc = rankUser.substring(3, 7);

                    const rankText = `*Hii ${config.BOT_NAME},👋 ${rankName}✧${disc}'s* Exp\n\n` +
                        `*👋Role*: ${rankRole}\n` +
                        `*📊Exp*: ${rankMessageCount} / ${(rankUserLevel?.level || 0 + 1) * 100}\n` +
                        `*📈Level*: ${rankUserLevel?.level || 0}\n` +
                        `*Total Messages*: ${rankMessageCount}`;

                    try {
                        const jid = await resolveToJid(bot.sock, rankUser);
                        const pfp = await bot.sock.profilePictureUrl(jid, "image");
                        return await bot.sock.sendMessage(message.chat, { 
                            image: { url: pfp },
                            caption: rankText
                        }, { quoted: message });
                    } catch {
                        return await bot.reply(rankText);
                    }
                    
                case 'leaderboard':
                case 'deck':
                    const leaderboard = await getLeaderboard(message.chat, 5);
                    if (!leaderboard.length) {
                        return await bot.reply("No level data available for this chat yet.");
                    }

                    let leaderboardText = `*----🏆 LeaderBoard 🏆 ----*\n\n`;
                    
                    for (let i = 0; i < leaderboard.length; i++) {
                        const user = leaderboard[i];
                        const name = await getUserName(bot.sock, user.userId);
                        const role = getRole(user.level);
                        
                        leaderboardText += `*${i + 1}🏆Name*: ${name}\n` +
                            `*🏆Level*: ${user.level}\n` +
                            `*🏆Points*: ${user.xp}\n` +
                            `*🏆Role*: ${role}\n` +
                            `*🏆Total messages*: ${user.xp}\n\n`;
                    }

                    return await bot.reply(leaderboardText);
                    
                default:
                    return await bot.reply(
                        `*Level System Commands:*\n\n` +
                        `${config.PREFIX}level on/off - Toggle level system\n` +
                        `${config.PREFIX}level profile [@user] - Show profile\n` +
                        `${config.PREFIX}level rank [@user] - Show rank\n` +
                        `${config.PREFIX}level leaderboard - Show top users`
                    );
            }
        } catch (error) {
            console.error('Level command error:', error);
            return await bot.reply("An error occurred while processing your request.");
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
            if (!config.MONGODB || !levelState.levelSystemEnabled || 
                message.key?.fromMe || !message.chat.endsWith('@g.us')) {
                return;
            }
            
            const currentUser = await getUserLevel(message.sender, message.chat);
            const messageCount = await calculateXP(bot.sock, message.sender, message.chat);
            
            if (messageCount > currentUser.xp) {
                const updatedUser = await updateUserLevel(message.sender, message.chat, messageCount);
                
                if (updatedUser && updatedUser.level > currentUser.level) {
                    const name = await getUserName(bot.sock, message.sender);
                    const role = getRole(updatedUser.level);
                    
                    await bot.sock.sendMessage(message.chat, {
                        text: `╭───────────╮\n` +
                              `│ *Wow, Someone just*\n` +
                              `│ *leveled Up huh✨*\n` +
                              `│ *👤Name*: ${name}\n` +
                              `│ *📌Level*: ${updatedUser.level}🎉\n` +
                              `│ *📊Exp*: ${updatedUser.xp} / ${(updatedUser.level + 1) * 100}\n` +
                              `│ *🎗️Role*: *${role}*\n` +
                              `│ *Enjoy🎊*\n` +
                              `╰───────────────────────────╯`
                    }, { quoted: message });
                }
            }
        } catch (error) {
            console.error('Level listener error:', error);
        }
    }
);