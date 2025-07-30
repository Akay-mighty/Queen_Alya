const bot = require("../lib/plugin");
const Levels = require("discord-xp");
const config = require("../config");

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
    16: "🌬Child of Nobel",
    18: "❄Nobel",
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
    for (const [maxLevel, role] of Object.entries(LEVEL_ROLES).sort((a, b) => b[0] - a[0])) {
        if (level <= maxLevel) return role;
    }
    return "GOD✨";
}

// Level system toggle
let levelSystemEnabled = true;

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
                levelSystemEnabled = true;
                return await bot.reply("Level system has been enabled.");
                
            case 'off':
                levelSystemEnabled = false;
                return await bot.reply("Level system has been disabled.");
                
            case 'profile':
                const profileUser = message.mentionedJid?.[0] || message.sender;
                try {
                    const user = await Levels.fetch(profileUser, "RandomXP");
                    const bio = await bot.sock.fetchStatus(profileUser).catch(() => ({ status: "No bio set" }));
                    const name = await store.getname(profileUser) || profileUser.split('@')[0];
                    const role = getRole(user.level);
                    const totalMessages = Math.floor(user.xp / 8);

                    const profile = `
*Hii ${name},*
*Here is your profile information*
*👤Username:* ${name}
*⚡Bio:* ${bio.status}
*🧩Role:* ${role}
*🍁Level:* ${user.level}
*📥Total Messages:* ${totalMessages}
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
                    const user = await Levels.fetch(rankUser, "RandomXP");
                    const name = await store.getname(rankUser) || rankUser.split('@')[0];
                    const role = getRole(user.level);
                    const disc = rankUser.substring(3, 7);
                    const totalMessages = Math.floor(user.xp / 8);

                    const rankText = `*Hii ${config.BOT_NAME},🌟 ${name}∆${disc}'s* Exp\n\n` +
                        `*🌟Role*: ${role}\n` +
                        `*🟢Exp*: ${user.xp} / ${Levels.xpFor(user.level + 1)}\n` +
                        `*🏡Level*: ${user.level}\n` +
                        `*Total Messages*: ${totalMessages}`;

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
                    const leaderboard = await Levels.fetchLeaderboard("RandomXP", 5);
                    let leaderboardText = `*----● LeaderBoard ● ----*\n\n`;

                    for (let i = 0; i < leaderboard.length; i++) {
                        const user = leaderboard[i];
                        const name = await store.getname(user.userID) || user.userID.split('@')[0] || "Unknown";
                        const role = getRole(user.level);
                        const totalMessages = Math.floor(user.xp / 8);

                        leaderboardText += `*${i + 1}●Name*: ${name}\n` +
                            `*●Level*: ${user.level}\n` +
                            `*●Points*: ${user.xp}\n` +
                            `*●Role*: ${role}\n` +
                            `*●Total messages*: ${totalMessages}\n\n`;
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
            if (!config.MONGODB || !levelSystemEnabled || message.key?.fromMe) return;
            
            const randomXp = 8;
            const hasLeveledUp = await Levels.appendXp(message.sender, "RandomXP", randomXp);
            
            if (hasLeveledUp) {
                const user = await Levels.fetch(message.sender, "RandomXP");
                const role = getRole(user.level);
                const name = message.pushName || await store.getname(message.sender) || "User";
                
                await bot.sock.sendMessage(message.chat, {
                    text: `╔════⪨\n` +
                          `║ *Wow, Someone just*\n` +
                          `║ *leveled Up huh⭐*\n` +
                          `║ *👤Name*: ${name}\n` +
                          `║ *🎐Level*: ${user.level}🍭\n` +
                          `║ *🛑Exp*: ${user.xp} / ${Levels.xpFor(user.level + 1)}\n` +
                          `║ *📍Role*: *${role}*\n` +
                          `║ *Enjoy🥳*\n` +
                          `╚════════════⪨`
                }, { quoted: message });
            }
        } catch (error) {
            console.error('Level listener error:', error);
        }
    }
);