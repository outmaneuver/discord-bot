import { EmbedBuilder } from 'discord.js';
import { verifyWallet, getBUXBalance, updateDiscordRoles } from '../services/verify.js';
import { redis } from '../config/redis.js';
import { calculateDailyReward } from '../services/rewards.js';
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
        const userId = targetUser.id;
        const wallets = await redis.smembers(`wallets:${userId}`);
        
        if (wallets.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(`${targetUser.username}'s BUXDAO Profile`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setDescription('❌ No wallets connected. Please connect your wallet at https://buxdao-verify-d1faffc83da7.herokuapp.com/holder-verify')
                .setFooter({ 
                    text: 'BUXDAO - Putting community first',
                    iconURL: 'https://buxdao.io/logo.png'
                })
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });
            return;
        }

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

        // Process each wallet
        for (const wallet of wallets) {
            try {
                console.log(`Checking wallet ${wallet} for profile...`);
                const result = await verifyWallet(userId, wallet);
                if (result?.success) {
                    console.log(`Got balance for ${wallet}:`, result.data.buxBalance);
                    totalBalance += result.data.buxBalance || 0;
                    Object.keys(nftCounts).forEach(key => {
                        nftCounts[key] += result.data.nftCounts[key] || 0;
                    });
                }
                await sleep(2000); // Add delay between wallets
            } catch (error) {
                console.error(`Error checking wallet ${wallet}:`, error);
                // Continue with next wallet
            }
        }

        console.log('Total BUX balance for profile:', totalBalance);
        const dailyReward = await calculateDailyReward(nftCounts);
        const displayBalance = (totalBalance / 1e9).toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 3
        });

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle(`${targetUser.username}'s BUXDAO Profile`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                { 
                    name: '🏦 Connected Wallets', 
                    value: wallets.join('\n') + '\n---------------------------------------------------------------',
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
                    name: '🎭 Server',
                    value: 
                        `Member Since: ${new Date(targetMember.joinedAt).toLocaleDateString()}\n` +
                        `Roles: ${targetMember.roles.cache.size - 1}\n` +  // -1 to exclude @everyone
                        '---------------------------------------------------------------',
                    inline: false
                },
                { 
                    name: '💰 BUX Balance', 
                    value: `${displayBalance} BUX`,
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
        await message.reply('An error occurred while fetching the profile. Please try again later.');
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
        const userId = targetUser.id;
        const wallets = await redis.smembers(`wallets:${userId}`);
        
        if (wallets.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(`${targetUser.username}'s NFT Holdings`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setDescription('No wallets connected. Please connect your wallet at https://buxdao-verify-d1faffc83da7.herokuapp.com/holder-verify')
                .setFooter({ 
                    text: 'BUXDAO - Putting community first',
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

        // Process each wallet
        for (const wallet of wallets) {
            try {
                const result = await verifyWallet(userId, wallet);
                if (result?.success) {
                    totalBuxBalance += result.data.buxBalance;
                    Object.keys(nftCounts).forEach(key => {
                        nftCounts[key] += result.data.nftCounts[key] || 0;
                    });
                }
            } catch (error) {
                console.error(`Error verifying wallet ${wallet}:`, error);
            }
        }

        // Update roles with the data we just fetched
        await updateDiscordRoles(targetUser.id, message.client, {
            totalBuxBalance,
            nftCounts
        });

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

async function showBUX(message, targetUser) {
    try {
        const userId = targetUser.id;
        const wallets = await redis.smembers(`wallets:${userId}`);
        
        if (wallets.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(`${targetUser.username}'s BUX Info`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setDescription('No wallets connected. Please connect your wallet at https://buxdao-verify-d1faffc83da7.herokuapp.com/holder-verify')
                .setFooter({ 
                    text: 'BUXDAO - Putting community first',
                    iconURL: 'https://buxdao.io/logo.png'
                });

            await message.channel.send({ embeds: [embed] });
            return;
        }

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

        // Process each wallet
        for (const wallet of wallets) {
            try {
                console.log(`Checking wallet ${wallet} for BUX balance...`);
                const result = await verifyWallet(userId, wallet);
                if (result?.success) {
                    console.log(`Got balance for ${wallet}:`, result.data.buxBalance);
                    totalBalance += result.data.buxBalance || 0;
                    Object.keys(nftCounts).forEach(key => {
                        nftCounts[key] += result.data.nftCounts[key] || 0;
                    });
                }
                await sleep(2000); // Add delay between wallets
            } catch (error) {
                console.error(`Error checking wallet ${wallet}:`, error);
                // Continue with next wallet, don't reset totalBalance
            }
        }

        console.log('Total BUX balance:', totalBalance);
        const dailyReward = await calculateDailyReward(nftCounts);
        const displayBalance = (totalBalance / 1e9).toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 3
        });

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle(`${targetUser.username}'s BUX Info`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                { 
                    name: '💰 BUX Balance', 
                    value: `${displayBalance} BUX\n---------------------------------------------------------------`,
                    inline: false 
                },
                { 
                    name: '🎁 Daily Rewards', 
                    value: `${dailyReward} BUX per day\n---------------------------------------------------------------`,
                    inline: false 
                },
                {
                    name: '💵 BUX Claim',
                    value: '0 BUX available',
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
        console.error('BUX command error:', error);
        await message.reply('An error occurred while fetching your BUX info. Please try again later.');
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

// Add constants
const EXEMPT_WALLETS = [
    'DXM1SKEbtDVFJcqLDJvSBSh83CeHkYv4qM88JG9BwJ5t', // Team wallet
    'BX1PEe4FJiWuHjFnYuYFB8edZsFg39BWggi65yTH52or', // Marketing wallet
    '95vRUfprVqvURhPryNdEsaBrSNmbE1uuufYZkyrxyjir', // Development wallet
    'FAEjAsCtpoapdsCF1DDhj71vdjQjSeAJt8gt9uYxL7gz', // Treasury wallet
    'He7HLAH2v8pnVafzxmfkqZUVefy4DUGiHmpetQFZNjrg', // Staking wallet
    'FFfTserUJGZEFLKB7ffqxaXvoHfdRJDtNYgXu7NEn8an', // Rewards wallet
    '9pRsKWUw2nQBfdVhfknyWQ4KEiDiYvahRXCf9an4kpW4', // Burn wallet
    'FYfLzXckAf2JZoMYBz2W4fpF9vejqpA6UFV17d1A7C75', // Burn wallet 2
    'H4RPEi5Sfpapy1B233b4DUhh6hsmFTTKx4pXqWnpW637'  // Burn wallet 3
];

const LIQUIDITY_WALLET = '3WNHW6sr1sQdbRjovhPrxgEJdWASZ43egGWMMNrhgoRR';
const BUX_TOKEN_MINT = 'FMiRxSbLqRTWiBszt1DZmXd7SrscWCccY7fcXNtwWxHK';

// Add constants for retry logic
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 2000;

// Add cache for BUX balances
const buxBalanceCache = new Map();
const BUX_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getBUXBalanceWithRetry(wallet) {
    // Check cache first
    const cached = buxBalanceCache.get(wallet);
    if (cached && (Date.now() - cached.timestamp) < BUX_CACHE_TTL) {
        console.log(`Using cached balance for ${wallet}:`, cached.balance);
        return cached.balance;
    }

    let retryCount = 0;
    let delay = INITIAL_RETRY_DELAY;

    while (retryCount < MAX_RETRIES) {
        try {
            const balance = await getBUXBalance(wallet);
            // Cache successful response
            buxBalanceCache.set(wallet, {
                balance,
                timestamp: Date.now()
            });
            return balance;
        } catch (error) {
            if (error.message.includes('429 Too Many Requests')) {
                console.log(`Retry ${retryCount + 1} for wallet ${wallet}, waiting ${delay}ms`);
                await sleep(delay);
                retryCount++;
                delay *= 2; // Double the delay for next retry
            } else {
                throw error; // Throw non-429 errors
            }
        }
    }

    // If we have a cached value, use it even if expired
    if (cached) {
        console.log(`Using expired cache for ${wallet} after retries failed:`, cached.balance);
        return cached.balance;
    }

    throw new Error(`Failed to get balance for ${wallet} after ${MAX_RETRIES} retries`);
}

async function showBUXInfo(message) {
    try {
        // Get SOL price
        const solPriceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        const solPriceData = await solPriceRes.json();
        const solPrice = solPriceData.solana.usd;

        // Get liquidity wallet SOL balance
        const connection = new Connection(process.env.SOLANA_RPC_URL);
        const liquidityBalance = await connection.getBalance(new PublicKey(LIQUIDITY_WALLET));
        const liquiditySol = (liquidityBalance / 1e9) + 17.75567; // Add fixed SOL amount

        // Get total supply from token mint
        const tokenSupply = await connection.getTokenSupply(new PublicKey(BUX_TOKEN_MINT));
        const totalSupply = tokenSupply.value.uiAmount;
        console.log('Total supply:', totalSupply);

        // Calculate public supply by fetching exempt wallet balances
        let exemptBalance = 0;
        for (const wallet of EXEMPT_WALLETS) {
            try {
                const balance = await getBUXBalanceWithRetry(wallet);
                console.log(`Exempt wallet ${wallet} balance:`, balance);
                exemptBalance += balance;
                await sleep(2000); // Add longer delay between wallets
            } catch (error) {
                console.error(`Failed to get balance for exempt wallet ${wallet} after retries:`, error);
                await message.reply('Error fetching BUX info. Please try again in a few minutes.');
                return;
            }
        }

        const publicSupply = totalSupply - exemptBalance;
        console.log('Total exempt balance:', exemptBalance);
        console.log('Calculated public supply:', publicSupply);

        // Calculate BUX value
        const buxValueSol = liquiditySol / publicSupply;
        const buxValueUsd = buxValueSol * solPrice;

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('BUX Token Info')
            .setThumbnail('https://buxdao-verify-d1faffc83da7.herokuapp.com/bux.jpg')
            .addFields(
                { 
                    name: 'Token Address', 
                    value: '[FMiRxSbLqRTWiBszt1DZmXd7SrscWCccY7fcXNtwWxHK](https://solscan.io/token/FMiRxSbLqRTWiBszt1DZmXd7SrscWCccY7fcXNtwWxHK#holders)',
                    inline: false 
                },
                { 
                    name: 'Public Supply', 
                    value: `${Math.floor(publicSupply).toLocaleString()} BUX`,
                    inline: true 
                },
                { 
                    name: 'Liquidity', 
                    value: `${liquiditySol.toFixed(2)} SOL ($${(liquiditySol * solPrice).toFixed(2)})`,
                    inline: true 
                },
                { 
                    name: 'BUX Value', 
                    value: `${buxValueSol.toFixed(8)} SOL ($${buxValueUsd.toFixed(8)})`,
                    inline: true 
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
        await message.reply('An error occurred while fetching BUX info. Please try again later.');
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
