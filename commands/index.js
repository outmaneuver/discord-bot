import { EmbedBuilder } from 'discord.js';
import { verifyWallet, getBUXBalance } from '../services/verify.js';
import { redis } from '../config/redis.js';
import { calculateDailyReward } from '../services/rewards.js';

// Command handler
async function handleCommand(message) {
    const command = message.content.toLowerCase();

    try {
        switch (command) {
            case '=help':
                await showHelp(message);
                break;
            case '=my.profile':
                await showProfile(message);
                break;
            case '=my.wallet':
                await showWallets(message);
                break;
            case '=my.nfts':
                await showNFTs(message);
                break;
            case '=my.roles':
                await showRoles(message);
                break;
            case '=my.bux':
                await showBUX(message);
                break;
            case '=info.catz':
                await showCatzInfo(message);
                break;
            case '=info.celeb':
                await showCelebInfo(message);
                break;
            case '=info.mm':
                await showMMInfo(message);
                break;
            case '=info.mm3d':
                await showMM3DInfo(message);
                break;
            case '=info.bots':
                await showBotsInfo(message);
                break;
            case '=info.bux':
                await showBUXInfo(message);
                break;
            case '=rewards':
                await showRewards(message);
                break;
        }
    } catch (error) {
        console.error('Command error:', error);
        await message.reply('An error occurred while processing your command.');
    }
}

async function showHelp(message) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('BUXDAO Bot Commands')
        .setThumbnail('https://i.imgur.com/AfFp7pu.png')
        .setDescription('Welcome to BUXDAO! Here are all available commands:')
        .addFields(
            { 
                name: '🎮 Profile Commands', 
                value: 
                    '`=my.profile` - Display your full profile\n' +
                    '`=my.wallet` - Show your connected wallets\n' +
                    '`=my.nfts` - Display your NFT holdings\n' +
                    '`=my.roles` - Show your server roles\n' +
                    '`=my.bux` - Show your BUX balance and rewards'
            },
            { 
                name: '📊 Collection Stats', 
                value: 
                    '`=info.catz` - Show Fcked Catz stats\n' +
                    '`=info.celeb` - Show Celeb Catz stats\n' +
                    '`=info.mm` - Show Money Monsters stats\n' +
                    '`=info.mm3d` - Show Money Monsters 3D stats\n' +
                    '`=info.bots` - Show AI Bitbots stats\n' +
                    '`=info.bux` - Show BUX token info'
            },
            { 
                name: '💰 Rewards', 
                value: '`=rewards` - Show daily reward calculations'
            }
        )
        .setFooter({ 
            text: 'BUXDAO - Building the future of Web3 gaming', 
            iconURL: 'https://i.imgur.com/AfFp7pu.png' 
        });

    await message.channel.send({ embeds: [embed] });
}

// Add command implementations
async function showProfile(message) {
    try {
        const userId = message.author.id;
        const wallets = await redis.smembers(`wallets:${userId}`) || [];
        
        if (wallets.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(`${message.author.username}'s BUXDAO Profile`)
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                .setDescription('❌ No wallets connected. Please connect your wallet at https://verify.buxdao.io')
                .setFooter({ 
                    text: 'BUXDAO - Building the future of Web3 gaming',
                    iconURL: 'https://buxdao.io/logo.png'
                })
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });
            return;
        }

        let nftCounts = {
            fcked_catz: 0,
            celebcatz: 0,
            money_monsters: 0,
            money_monsters3d: 0,
            ai_bitbots: 0,
            warriors: 0,
            squirrels: 0,
            rjctd_bots: 0,
            energy_apes: 0,
            doodle_bots: 0,
            candy_bots: 0
        };

        let totalBuxBalance = 0;

        for (const wallet of wallets) {
            try {
                const result = await verifyWallet(userId, wallet);
                if (result?.success) {
                    totalBuxBalance += result.data.buxBalance || 0;
                    if (result.data.nftCounts) {
                        Object.keys(nftCounts).forEach(key => {
                            nftCounts[key] += result.data.nftCounts[key] || 0;
                        });
                    }
                }
            } catch (err) {
                console.error(`Error verifying wallet ${wallet}:`, err);
                // Continue with next wallet
            }
        }

        const dailyReward = await calculateDailyReward(nftCounts);
        const aiCollabsCount = nftCounts.warriors + nftCounts.squirrels + nftCounts.rjctd_bots + 
                              nftCounts.energy_apes + nftCounts.doodle_bots + nftCounts.candy_bots;

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle(`${message.author.username}'s BUXDAO Profile`)
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .addFields(
                { 
                    name: '🏦 Connected Wallets', 
                    value: wallets.map(w => `\`${w}\``).join('\n') + '\n---------------------------------------------------------------',
                    inline: false 
                },
                { 
                    name: '🎨 Main Collections', 
                    value: 
                        `Fcked Catz: ${nftCounts.fcked_catz}\n` +
                        `Celeb Catz: ${nftCounts.celebcatz}\n` +
                        `Money Monsters: ${nftCounts.money_monsters}\n` +
                        `Money Monsters 3D: ${nftCounts.money_monsters3d}\n` +
                        `AI Bitbots: ${nftCounts.ai_bitbots}\n` +
                        '---------------------------------------------------------------',
                    inline: false
                },
                {
                    name: '🤖 A.I. Collabs',
                    value:
                        `A.I. Warriors: ${nftCounts.warriors}\n` +
                        `A.I. Squirrels: ${nftCounts.squirrels}\n` +
                        `A.I. Energy Apes: ${nftCounts.energy_apes}\n` +
                        `RJCTD bots: ${nftCounts.rjctd_bots}\n` +
                        `Candy bots: ${nftCounts.candy_bots}\n` +
                        `Doodle bots: ${nftCounts.doodle_bots}\n` +
                        '---------------------------------------------------------------',
                    inline: false
                },
                { 
                    name: '💰 BUX Balance', 
                    value: `${(totalBuxBalance / 1e9).toLocaleString()} BUX`,
                    inline: false 
                },
                { 
                    name: '🎁 Daily Rewards', 
                    value: `${dailyReward} BUX per day`,
                    inline: false 
                },
                {
                    name: '💵 BUX Claim',
                    value: `0 BUX available`,
                    inline: false
                }
            )
            .setImage('https://buxdao.io/banner.png')
            .setFooter({ 
                text: 'BUXDAO - Putting community first',
                iconURL: 'https://buxdao.io/logo.png'
            })
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Profile command error:', error);
        await message.reply('An error occurred while fetching your profile. Please try again later.');
    }
}

// Add these functions after showProfile...

async function showWallets(message) {
    const userId = message.author.id;
    const wallets = await redis.smembers(`wallets:${userId}`);
    
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Your Connected Wallets')
        .setDescription(wallets.length > 0 ? wallets.join('\n') : 'No wallets connected');

    await message.channel.send({ embeds: [embed] });
}

async function showNFTs(message) {
    const userId = message.author.id;
    const wallets = await redis.smembers(`wallets:${userId}`);
    let nftCounts = {
        fcked_catz: 0,
        celebcatz: 0,
        money_monsters: 0,
        money_monsters3d: 0,
        ai_bitbots: 0,
        warriors: 0,
        squirrels: 0,
        rjctd_bots: 0,
        energy_apes: 0,
        doodle_bots: 0,
        candy_bots: 0
    };

    for (const wallet of wallets) {
        const result = await verifyWallet(userId, wallet);
        if (result.success) {
            Object.keys(nftCounts).forEach(key => {
                nftCounts[key] += result.data.nftCounts[key];
            });
        }
    }

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Your NFT Holdings')
        .addFields(
            { name: 'Fcked Catz', value: nftCounts.fcked_catz.toString(), inline: true },
            { name: 'Celeb Catz', value: nftCounts.celebcatz.toString(), inline: true },
            { name: 'Money Monsters', value: nftCounts.money_monsters.toString(), inline: true },
            { name: 'Money Monsters 3D', value: nftCounts.money_monsters3d.toString(), inline: true },
            { name: 'AI Bitbots', value: nftCounts.ai_bitbots.toString(), inline: true },
            { name: 'AI Collabs', value: (
                nftCounts.warriors + 
                nftCounts.squirrels + 
                nftCounts.rjctd_bots + 
                nftCounts.energy_apes + 
                nftCounts.doodle_bots + 
                nftCounts.candy_bots
            ).toString(), inline: true }
        );

    await message.channel.send({ embeds: [embed] });
}

async function showRoles(message) {
    const roles = message.member.roles.cache
        .filter(role => role.name !== '@everyone')
        .map(role => role.name)
        .sort();

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Your Server Roles')
        .setDescription(roles.length > 0 ? roles.join('\n') : 'No roles');

    await message.channel.send({ embeds: [embed] });
}

async function showBUX(message) {
    const userId = message.author.id;
    const wallets = await redis.smembers(`wallets:${userId}`);
    let totalBalance = 0;
    let nftCounts = {
        fcked_catz: 0,
        celebcatz: 0,
        money_monsters: 0,
        money_monsters3d: 0,
        ai_bitbots: 0,
        warriors: 0,
        squirrels: 0,
        rjctd_bots: 0,
        energy_apes: 0,
        doodle_bots: 0,
        candy_bots: 0
    };

    for (const wallet of wallets) {
        const result = await verifyWallet(userId, wallet);
        if (result.success) {
            totalBalance += result.data.buxBalance;
            Object.keys(nftCounts).forEach(key => {
                nftCounts[key] += result.data.nftCounts[key];
            });
        }
    }

    const dailyReward = await calculateDailyReward(nftCounts);

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Your BUX Info')
        .addFields(
            { name: 'Total BUX Balance', value: totalBalance.toLocaleString() },
            { name: 'Daily Reward', value: dailyReward.toString() }
        );

    await message.channel.send({ embeds: [embed] });
}

async function showCatzInfo(message) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Fcked Catz Collection Info')
        .addFields(
            { name: 'Supply', value: '3,333', inline: true },
            { name: 'Mint Price', value: '0.5 SOL', inline: true },
            { name: 'Daily Reward', value: '5 BUX', inline: true },
            { name: 'Magic Eden', value: '[View Collection](https://magiceden.io/marketplace/fcked_catz)' }
        );

    await message.channel.send({ embeds: [embed] });
}

async function showCelebInfo(message) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Celeb Catz Collection Info')
        .addFields(
            { name: 'Supply', value: '333', inline: true },
            { name: 'Mint Price', value: '3.33 SOL', inline: true },
            { name: 'Daily Reward', value: '15 BUX', inline: true },
            { name: 'Magic Eden', value: '[View Collection](https://magiceden.io/marketplace/celebcatz)' }
        );

    await message.channel.send({ embeds: [embed] });
}

async function showMMInfo(message) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Money Monsters Collection Info')
        .addFields(
            { name: 'Supply', value: '3,333', inline: true },
            { name: 'Mint Price', value: '0.5 SOL', inline: true },
            { name: 'Daily Reward', value: '5 BUX', inline: true },
            { name: 'Magic Eden', value: '[View Collection](https://magiceden.io/marketplace/money_monsters)' }
        );

    await message.channel.send({ embeds: [embed] });
}

async function showMM3DInfo(message) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Money Monsters 3D Collection Info')
        .addFields(
            { name: 'Supply', value: '3,333', inline: true },
            { name: 'Mint Price', value: '1 SOL', inline: true },
            { name: 'Daily Reward', value: '10 BUX', inline: true },
            { name: 'Magic Eden', value: '[View Collection](https://magiceden.io/marketplace/money_monsters_3d)' }
        );

    await message.channel.send({ embeds: [embed] });
}

async function showBotsInfo(message) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('AI Bitbots Collection Info')
        .addFields(
            { name: 'Supply', value: '3,333', inline: true },
            { name: 'Mint Price', value: '0.33 SOL', inline: true },
            { name: 'Daily Reward', value: '3 BUX', inline: true },
            { name: 'Magic Eden', value: '[View Collection](https://magiceden.io/marketplace/ai_bitbots)' }
        );

    await message.channel.send({ embeds: [embed] });
}

async function showBUXInfo(message) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('BUX Token Info')
        .addFields(
            { name: 'Token Address', value: 'FMiRxSbLqRTWiBszt1DZmXd7SrscWCccY7fcXNtwWxHK' },
            { name: 'Total Supply', value: '1,000,000,000' },
            { name: 'Decimals', value: '9' },
            { name: 'Jupiter', value: '[Trade BUX](https://jup.ag/swap/SOL-BUX)' }
        );

    await message.channel.send({ embeds: [embed] });
}

async function showRewards(message) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Daily BUX Rewards')
        .addFields(
            { name: 'Fcked Catz', value: '5 BUX', inline: true },
            { name: 'Celeb Catz', value: '15 BUX', inline: true },
            { name: 'Money Monsters', value: '5 BUX', inline: true },
            { name: 'Money Monsters 3D', value: '10 BUX', inline: true },
            { name: 'AI Bitbots', value: '3 BUX', inline: true },
            { name: 'AI Collabs', value: '1 BUX', inline: true }
        )
        .setFooter({ text: 'Rewards are per NFT and claimed daily' });

    await message.channel.send({ embeds: [embed] });
}

export {
    showHelp,
    showProfile,
    showWallets,
    showNFTs,
    showRoles,
    showBUX,
    showCatzInfo,
    showCelebInfo,
    showMMInfo,
    showMM3DInfo,
    showBotsInfo,
    showBUXInfo,
    showRewards,
    handleCommand
};
