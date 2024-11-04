import { EmbedBuilder } from 'discord.js';
import { verifyWallet, getBUXBalance, updateDiscordRoles, getBUXValue, LIQUIDITY_WALLET, BUX_TOKEN_MINT } from '../services/verify.js';
import { redis } from '../config/redis.js';
import { calculateDailyReward, getClaimableAmount } from '../services/rewards.js';
import { Connection, PublicKey } from '@solana/web3.js';
import fetch from 'node-fetch';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Add sleep helper function
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Fix admin role check helper
function isAdmin(member) {
    // Check if member has the admin role ID from .env
    const hasAdminRole = member.roles.cache.has('948256376793235507');
    console.log(`Checking admin role for ${member.user.username}: ${hasAdminRole}`);
    return hasAdminRole;
}

// Command handler
async function handleCommand(message) {
    const args = message.content.toLowerCase().split(' ');
    const command = args[0];
    const mentionedUser = message.mentions.users.first();

    // Check if admin is trying to view someone else's data
    if (mentionedUser && !isAdmin(message.member)) {
        await message.reply('You do not have permission to view other users\' data.');
        return;
    }

    // Use mentioned user if admin, otherwise use message author
    const targetUser = mentionedUser && isAdmin(message.member) ? mentionedUser : message.author;
    const targetMember = mentionedUser && isAdmin(message.member) ? 
        await message.guild.members.fetch(mentionedUser.id) : message.member;

    try {
        switch (command) {
            case '=help':
                await showHelp(message);
                break;
            case '=my.profile':
                await showProfile(message, targetUser, targetMember);
                break;
            case '=my.wallet':
                await showWallets(message, targetUser);
                break;
            case '=my.nfts':
                await showNFTs(message, targetUser);
                break;
            case '=my.roles':
                await showRoles(message, targetUser, targetMember);
                break;
            case '=my.bux':
                await showBUX(message, targetUser);
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
        .setThumbnail('https://buxdao-verify-d1faffc83da7.herokuapp.com/bux.jpg')
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
            text: 'BUXDAO - Putting community first', 
            iconURL: 'https://buxdao-verify-d1faffc83da7.herokuapp.com/bux.jpg'
        });

    await message.channel.send({ embeds: [embed] });
}

// Add role verification helper function
async function verifyAndUpdateRoles(message) {
    try {
        const client = message.client;
        await updateDiscordRoles(message.author.id, client);
    } catch (error) {
        console.error('Role verification error:', error);
    }
}

// Update each =my. command to include role verification
async function showProfile(message, targetUser, targetMember) {
    try {
        // First verify and update roles
        console.log(`Checking roles for ${targetUser.username}`);
        await updateDiscordRoles(targetUser.id, message.client);
        
        // Then display profile
        await displayProfile(message, targetUser, targetMember);
    } catch (error) {
        console.error('Profile command error:', error);
        await message.reply('An error occurred while fetching your profile.');
    }
}

// Add these functions after showProfile...

async function showWallets(message, targetUser) {
    try {
        const userId = targetUser.id;
        const wallets = await redis.smembers(`wallets:${userId}`);
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`${targetUser.username}'s Connected Wallets`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setDescription(wallets.length > 0 ? wallets.join('\n') : 'No wallets connected')
            .setFooter({ 
                text: 'BUXDAO - Putting community first',
                iconURL: 'https://buxdao.io/logo.png'
            });

        await message.channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Wallets command error:', error);
        await message.reply('An error occurred while fetching the wallets. Please try again later.');
    }
}

async function showNFTs(message, targetUser) {
    try {
        // First verify and update roles
        console.log(`Checking roles for ${targetUser.username}`);
        await updateDiscordRoles(targetUser.id, message.client);

        const wallets = await redis.smembers(`wallets:${targetUser.id}`);
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
            try {
                const result = await verifyWallet(targetUser.id, wallet);
                if (result?.success) {
                    for (const [collection, count] of Object.entries(result.data.nftCounts)) {
                        if (nftCounts[collection] !== undefined) {
                            nftCounts[collection] += count;
                        }
                    }
                }
            } catch (error) {
                console.error(`Error verifying wallet ${wallet}:`, error);
            }
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`${targetUser.username}'s NFT Collection`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
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
                }
            )
            .setFooter({ 
                text: 'BUXDAO - Putting community first',
                iconURL: 'https://buxdao.io/logo.png'
            })
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('NFTs command error:', error);
        await message.reply('An error occurred while fetching the NFTs. Please try again later.');
    }
}

async function showRoles(message, targetUser, targetMember) {
    try {
        await verifyAndUpdateRoles(message);
        
        const roles = targetMember.roles.cache
            .filter(role => role.name !== '@everyone')
            .map(role => role.name)
            .sort();

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`${targetUser.username}'s Server Roles`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setDescription(roles.length > 0 ? roles.join('\n') : 'No roles')
            .setFooter({ 
                text: 'BUXDAO - Putting community first',
                iconURL: 'https://buxdao.io/logo.png'
            });

        await message.channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Roles command error:', error);
        await message.reply('An error occurred while fetching the roles. Please try again later.');
    }
}

async function showBUX(message) {
    try {
        const buxValue = await getBUXValue();
        const wallets = await redis.smembers(`wallets:${message.author.id}`);
        let totalBalance = 0;

        for (const wallet of wallets) {
            try {
                const balance = await getBUXBalance(wallet);
                totalBalance += balance;
            } catch (error) {
                console.error(`Error getting wallet balance: ${error}`);
            }
        }

        const balanceUsdValue = totalBalance * buxValue.buxValueUsd;

        // Get daily rewards
        const { nftCounts } = await verifyWallet(message.author.id, wallets[0] || '');
        const dailyReward = calculateDailyReward(nftCounts);

        // Get claimable amount
        const claimable = await getClaimableAmount(message.author.id);

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`${message.author.username}'s BUX Info`)
            .setDescription('---------------------------------------------------------------')
            .addFields(
                { 
                    name: '💰 BUX Balance', 
                    value: `${totalBalance.toLocaleString()} BUX ($${balanceUsdValue.toFixed(2)})`,
                    inline: false 
                },
                { 
                    name: '🎁 Daily Rewards', 
                    value: `${dailyReward} BUX per day`,
                    inline: false 
                },
                { 
                    name: '💵 BUX Claim', 
                    value: `${claimable} BUX available`,
                    inline: false 
                }
            )
            .setFooter({ 
                text: 'BUXDAO - Putting community first',
                iconURL: 'https://buxdao.io/logo.png'
            });

        await message.channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error in showBUX:', error);
        await message.reply('An error occurred while fetching your BUX info.');
    }
}

async function displayProfile(message, targetUser, targetMember) {
    try {
        const userId = targetUser.id;
        const wallets = await redis.smembers(`wallets:${userId}`);
        let totalBuxBalance = 0;
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

        // Get BUX value for USD conversion
        const buxValue = await getBUXValue();

        // Get NFT counts and BUX balance
        for (const wallet of wallets) {
            try {
                const result = await verifyWallet(userId, wallet);
                if (result.success) {
                    totalBuxBalance += result.data.buxBalance / 1e9;
                    for (const [collection, count] of Object.entries(result.data.nftCounts)) {
                        if (nftCounts[collection] !== undefined) {
                            nftCounts[collection] += count;
                        }
                    }
                }
            } catch (error) {
                console.error(`Error verifying wallet ${wallet}:`, error);
            }
        }

        // Calculate USD value
        const buxUsdValue = totalBuxBalance * buxValue.buxValueUsd;

        // Create embed
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`${targetUser.username}'s BUXDAO Profile`)
            .addFields(
                { 
                    name: '🏦 Connected Wallets',
                    value: wallets.length > 0 ? wallets.join('\n') : 'No wallets connected',
                    inline: false 
                },
                {
                    name: '---------------------------------------------------------------',
                    value: '\u200B',
                    inline: false
                },
                { 
                    name: '🎨 Main Collections',
                    value: 
                        `Fcked Catz: ${nftCounts.fcked_catz}\n` +
                        `Celeb Catz: ${nftCounts.celebcatz}\n` +
                        `Money Monsters: ${nftCounts.money_monsters}\n` +
                        `Money Monsters 3D: ${nftCounts.money_monsters3d}\n` +
                        `AI Bitbots: ${nftCounts.ai_bitbots}`,
                    inline: false 
                },
                {
                    name: '---------------------------------------------------------------',
                    value: '\u200B',
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
                        `Doodle bots: ${nftCounts.doodle_bots}`,
                    inline: false
                },
                {
                    name: '---------------------------------------------------------------',
                    value: '\u200B',
                    inline: false
                },
                {
                    name: '🎭 Server',
                    value: 
                        `Member Since: ${targetMember.joinedAt.toLocaleDateString()}\n` +
                        `Roles: ${targetMember.roles.cache.size - 1}`,
                    inline: false
                },
                {
                    name: '---------------------------------------------------------------',
                    value: '\u200B',
                    inline: false
                },
                { 
                    name: '💰 BUX Balance',
                    value: `${totalBuxBalance.toLocaleString()} BUX ($${buxUsdValue.toFixed(2)})`,
                    inline: false 
                },
                { 
                    name: '🎁 Daily Rewards',
                    value: `${await calculateDailyReward(nftCounts)} BUX per day`,
                    inline: false 
                },
                { 
                    name: '💵 BUX Claim',
                    value: `${await getClaimableAmount(userId)} BUX available`,
                    inline: false 
                }
            )
            .setFooter({ 
                text: 'BUXDAO - Putting community first',
                iconURL: 'https://buxdao.io/logo.png'
            });

        if (targetUser.avatarURL()) {
            embed.setThumbnail(targetUser.avatarURL({ dynamic: true }));
        }

        await message.channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error in displayProfile:', error);
        throw error;
    }
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
    try {
        const buxValue = await getBUXValue();
        const connection = new Connection(process.env.SOLANA_RPC_URL);
        const tokenSupply = await connection.getTokenSupply(new PublicKey(BUX_TOKEN_MINT));

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('BUX Token Info')
            .addFields(
                { 
                    name: '💰 Token Supply',
                    value: `${tokenSupply.value.uiAmount.toLocaleString()} BUX`,
                    inline: false 
                },
                { 
                    name: '💎 BUX Value',
                    value: `$${buxValue.buxValueUsd.toFixed(8)}`,
                    inline: false 
                },
                { 
                    name: '🌊 Liquidity',
                    value: `${buxValue.liquiditySol.toFixed(2)} SOL ($${(buxValue.liquiditySol * buxValue.solPrice).toFixed(2)})`,
                    inline: false 
                }
            )
            .setFooter({ 
                text: 'BUXDAO - Putting community first',
                iconURL: 'https://buxdao.io/logo.png'
            })
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error in showBUXInfo:', error);
        await message.reply('An error occurred while fetching BUX info.');
    }
}

async function showRewards(message) {
    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('Daily BUX Rewards')
        .addFields(
            { 
                name: '🎨 Main Collections', 
                value: 
                    'Fcked Catz: 5 BUX\n' +
                    'Celeb Catz: 15 BUX\n' +
                    'Money Monsters: 5 BUX\n' +
                    'Money Monsters 3D: 10 BUX\n' +
                    'AI Bitbots: 3 BUX\n' +
                    '---------------------------------------------------------------',
                inline: false 
            },
            {
                name: '🤖 A.I. Collabs',
                value: 
                    'A.I. Warriors: 1 BUX\n' +
                    'A.I. Squirrels: 1 BUX\n' +
                    'A.I. Energy Apes: 1 BUX\n' +
                    'RJCTD bots: 1 BUX\n' +
                    'Candy bots: 1 BUX\n' +
                    'Doodle bots: 1 BUX',
                inline: false
            }
        )
        .setFooter({ 
            text: 'BUXDAO - Putting community first',
            iconURL: 'https://buxdao.io/logo.png'
        })
        .setTimestamp();

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
