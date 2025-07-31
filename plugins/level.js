const bot = require("../lib/plugin");
const Levels = require("discord-xp");
const config = require("../config");
const fs = require('fs');
const path = require('path');

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

// Initialize MongoDB connection if configured
if (config.MONGODB) {
    try {
        Levels.setURL(config.MONGODB);
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
    }
}

// Level roles mapping
const LEVEL_ROLES = {
    2: "🏳Citizen",
    4: "👼Baby Wizard",
    6: "🧙‍♀️Wizard",
    8: "🧙‍♂️Wizard Lord",
    10: "🧚🏻Baby Mage",
    12: "🧜Mage",
    14: "🧜‍♂️Master of Mage",
    16: "🌬Child of Noble",
    18: "❄Noble",
    20: "⚡Speed of Elite",
    22: "🎭Elite",
    24: "🥇Ace I",
    26: "🥈Ace II",
    28: "🥉Ace Master",
    30: "🎖Ace Dominator",
    32: "🏅Ace Elite",
    34: "🏆Ace Supreme",
    36: "💍Supreme I",
    38: "💎Supreme Ii",
    40: "🔮Supreme Master",
    42: "🛡Legend III",
    44: "🏹Legend II",
    46: "⚔Legend",
    55: "🐉Immortal"
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
    
    return "GOD✨";
}

// Calculate XP based on message count (1 XP per message)
async function calculateXP(userId, chatId) {
    try {
        const chatHistory = await store.getChatHistory(chatId);
        if (!chatHistory?.length) return 0;

        let messageCount = 0;
        for (const entry of chatHistory) {
            try {
                const msg = JSON.parse(entry.message);
                if (msg.key?.fromMe) continue;
                
                const participant = msg.key?.participant || msg.key?.remoteJid;
                if (participant === userId) {
                    messageCount++;
                }
            } catch (e) {
                console.error('Message parse error:', e);
            }
        }
        return messageCount;
    } catch (error) {
        console.error('Error calculating XP:', error);
        return 0;
    }
}

// Get user name using store.getname only
async function getUserName(userId) {
    try {
        return await store.getname(userId) || userId.split('@')[0];
    } catch {
        return userId.split('@')[0];
    }
}

// Get user bio
async function getUserBio(userId) {
    try {
        const statusData = await bot.sock.fetchStatus(userId);
        return statusData?.[0]?.status?.status || "No bio set";
    } catch {
        return "No bio set";
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

        const query = message.query?.trim() || '';
        const [action, ...rest] = query.split(' ');

        switch (action.toLowerCase()) {
            case 'on':
                const onSuccess = updateConfig({ LEVEL_UP: "true" });
                if (onSuccess) {
                    return await bot.reply("Level system has been enabled.");
                } else {
                    return await bot.reply("Failed to enable level system.");
                }
                
            case 'off':
                const offSuccess = updateConfig({ LEVEL_UP: "false" });
                if (offSuccess) {
                    return await bot.reply("Level system has been disabled.");
                } else {
                    return await bot.reply("Failed to disable level system.");
                }
                
            case 'profile':
                const profileUser = message.mentionedJid?.[0] || message.sender;
                try {
                    const messageCount = await calculateXP(profileUser, message.chat);
                    const currentLevel = Levels.getLevelFromXP(messageCount);
                    const name = await getUserName(profileUser);
                    const bio = await getUserBio(profileUser);
                    const role = getRole(currentLevel);

                    const profile = `
*Hii ${name},*
*Here is your profile information*
*👤Username:* ${name}
*⚡Bio:* ${bio}
*🧩Role:* ${role}
*🍁Level:* ${currentLevel}
*📥Total Messages:* ${messageCount}
*Powered by ${config.BOT_NAME}*
`;

                    try {
                        const pfp = await bot.sock.profilePictureUrl(profileUser, "image");
                        return await bot.sock.sendMessage(message.chat, { 
                            image: { url: pfp },
                            caption: profile 
                        }, { quoted: message });
                    } catch {
                        return await bot.reply(profile);
                    }
                } catch (error) {
                    console.error('Profile error:', error);
                    return await bot.reply("Failed to fetch profile information.");
                }
                
            case 'rank':
                const rankUser = message.mentionedJid?.[0] || message.sender;
                try {
                    const messageCount = await calculateXP(rankUser, message.chat);
                    const currentLevel = Levels.getLevelFromXP(messageCount);
                    const name = await getUserName(rankUser);
                    const role = getRole(currentLevel);
                    const disc = rankUser.substring(3, 7);

                    const rankText = `*Hii ${config.BOT_NAME},🌟 ${name}∆${disc}'s* Exp\n\n` +
                        `*🌟Role*: ${role}\n` +
                        `*🟢Exp*: ${messageCount} / ${Levels.xpFor(currentLevel + 1)}\n` +
                        `*🏡Level*: ${currentLevel}\n` +
                        `*Total Messages*: ${messageCount}`;

                    try {
                        const pfp = await bot.sock.profilePictureUrl(rankUser, "image");
                        return await bot.sock.sendMessage(message.chat, { 
                            image: { url: pfp },
                            caption: rankText
                        }, { quoted: message });
                    } catch {
                        return await bot.reply(rankText);
                    }
                } catch (error) {
                    console.error('Rank error:', error);
                    return await bot.reply("Failed to fetch rank information.");
                }
                
            case 'leaderboard':
            case 'deck':
                try {
                    const chatHistory = await store.getChatHistory(message.chat);
                    if (!chatHistory?.length) {
                        return await bot.reply("No message history available for this chat.");
                    }

                    const userActivity = {};
                    for (const entry of chatHistory) {
                        try {
                            const msg = JSON.parse(entry.message);
                            if (msg.key?.fromMe) continue;
                            const participant = msg.key?.participant || msg.key?.remoteJid;
                            if (!participant) continue;
                            userActivity[participant] = (userActivity[participant] || 0) + 1;
                        } catch (e) {
                            console.error('Message parse error:', e);
                        }
                    }

                    const users = await Promise.all(
                        Object.entries(userActivity)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 5)
                            .map(async ([id, count]) => {
                                const name = await getUserName(id);
                                const level = Levels.getLevelFromXP(count);
                                const role = getRole(level);
                                return { id, name, count, level, role };
                            })
                    );

                    let leaderboardText = `*----● LeaderBoard ● ----*\n\n`;

                    for (let i = 0; i < users.length; i++) {
                        const user = users[i];
                        leaderboardText += `*${i + 1}●Name*: ${user.name}\n` +
                            `*●Level*: ${user.level}\n` +
                            `*●Points*: ${user.count}\n` +
                            `*●Role*: ${user.role}\n` +
                            `*●Total messages*: ${user.count}\n\n`;
                    }

                    return await bot.reply(leaderboardText);
                } catch (error) {
                    console.error('Leaderboard error:', error);
                    return await bot.reply("Failed to fetch leaderboard.");
                }
                
            default:
                return await bot.reply(
                    `*Level System Commands:*\n\n` +
                    `${config.PREFIX}level on/off - Toggle level system\n` +
                    `${config.PREFIX}level profile [@user] - Show profile\n` +
                    `${config.PREFIX}level rank [@user] - Show rank\n` +
                    `${config.PREFIX}level leaderboard - Show top users`
                );
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
            if (!config.MONGODB || !levelState.levelSystemEnabled || message.key?.fromMe) return;
            
            const messageCount = await calculateXP(message.sender, message.chat);
            const currentUser = await Levels.fetch(message.sender, message.chat);
            
            if (!currentUser || messageCount > currentUser.xp) {
                const hasLeveledUp = await Levels.setXp(message.sender, message.chat, messageCount);
                
                if (hasLeveledUp) {
                    const newLevel = Levels.getLevelFromXP(messageCount);
                    const role = getRole(newLevel);
                    const name = await getUserName(message.sender);
                    
                    await bot.sock.sendMessage(message.chat, {
                        text: `╔════⪨\n` +
                              `║ *Wow, Someone just*\n` +
                              `║ *leveled Up huh⭐*\n` +
                              `║ *👤Name*: ${name}\n` +
                              `║ *🎐Level*: ${newLevel}🍭\n` +
                              `║ *🛑Exp*: ${messageCount} / ${Levels.xpFor(newLevel + 1)}\n` +
                              `║ *📍Role*: *${role}*\n` +
                              `║ *Enjoy🥳*\n` +
                              `╚════════════⪨`
                    }, { quoted: message });
                }
            }
        } catch (error) {
            console.error('Level listener error:', error);
        }
    }
);