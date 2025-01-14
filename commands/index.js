import { EmbedBuilder } from 'discord.js';
import { redis } from '../config/redis.js';
import { verifyWallet, getBUXBalance, updateDiscordRoles, getBUXValue, LIQUIDITY_WALLET, BUX_TOKEN_MINT } from '../services/verify.js';
import { calculateDailyReward, getClaimableAmount } from '../services/rewards.js';
import { Connection, PublicKey } from '@solana/web3.js';
import fetch from 'node-fetch';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import Redis from 'ioredis';

// Add sleep helper function
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Fix admin role check helper
function isAdmin(member) {
    const hasAdminRole = member.roles.cache.has('948256376793235507');
    console.log(`Checking admin role for ${member.user.username}: ${hasAdminRole}`);
    return hasAdminRole;
}

// Add command cooldowns
const commandCooldowns = new Map();

// Command handler
async function handleCommand(message) {
    // Split the full command by dots
    const [baseCommand, ...args] = message.content.slice(1).split('.');
    
    // Check cooldown using the base command
    const cooldown = commandCooldowns.get(`${message.author.id}-${baseCommand}`);
    if (cooldown && Date.now() < cooldown) {
        return message.reply('Please wait before using this command again');
    }

    // Set cooldown (30 seconds)
    commandCooldowns.set(`${message.author.id}-${baseCommand}`, Date.now() + 30000);

    try {
        switch(baseCommand) {
            case 'help':
                const helpEmbed = new EmbedBuilder()
                    .setTitle('BUXDAO Bot Commands')
                    .setColor('#0099ff')
                    .setDescription('Welcome to BUXDAO! Here are all available commands:')
                    .addFields(
                        { name: '🎮 Profile Commands', value: 
                            '=my.profile - Display your full profile\n' +
                            '=my.wallet - Show your connected wallets\n' +
                            '=my.nfts - Display your NFT holdings\n' +
                            '=my.roles - Show your server roles\n' +
                            '=my.bux - Show your BUX balance and rewards'
                        },
                        { name: '📊 Collection Stats', value:
                            '=info.catz - Show Fcked Catz stats\n' +
                            '=info.celeb - Show Celeb Catz stats\n' +
                            '=info.mm - Show Money Monsters stats\n' +
                            '=info.mm3d - Show Money Monsters 3D stats\n' +
                            '=info.bots - Show AI Bitbots stats\n' +
                            '=info.bux - Show BUX token info'
                        },
                        { name: '💰 Rewards', value: '=rewards - Show daily reward calculations' }
                    )
                    .setFooter({ text: 'BUXDAO - Building the future of Web3 gaming' });
                
                await message.reply({ embeds: [helpEmbed] });
                break;

            case 'my.profile': {
                const connectedWallets = await redis.smembers(`wallets:${message.author.id}`);
                if (!connectedWallets || connectedWallets.length === 0) {
                    return message.reply('No wallets connected. Please verify your wallet first.');
                }

                // Add loading message
                const loadingMsg = await message.reply('Loading profile data...');

                try {
                    const nftData = await updateDiscordRoles(message.author.id, message.client);
                    if (!nftData || !nftData.nftCounts) {
                        await loadingMsg.edit('Error loading NFT data. Please try again later.');
                        return;
                    }

                    const buxBalance = nftData.buxBalance;
                    const dailyReward = await calculateDailyReward(nftData.nftCounts);
                    const claimableAmount = await getClaimableAmount(message.author.id);

                    const embed = new EmbedBuilder()
                        .setTitle(`${message.author.username}'s BUXDAO Profile`)
                        .setColor('#0099ff')
                        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                        .addFields(
                            { name: '🏦 Connected Wallets', value: connectedWallets.join('\n') || 'None' },
                            { name: '\u200B', value: '---------------------------------------------------------------' },
                            { name: '🎨 Main Collections', value: 
                                `Fcked Catz: ${nftData.nftCounts.fcked_catz || 0}\n` +
                                `Celeb Catz: ${nftData.nftCounts.celebcatz || 0}\n` +
                                `Money Monsters: ${nftData.nftCounts.money_monsters || 0}\n` +
                                `Money Monsters 3D: ${nftData.nftCounts.money_monsters3d || 0}\n` +
                                `AI Bitbots: ${nftData.nftCounts.ai_bitbots || 0}`
                            },
                            { name: '\u200B', value: '---------------------------------------------------------------' },
                            { name: '🤖 A.I. Collabs', value:
                                `A.I. Warriors: ${nftData.nftCounts.warriors || 0}\n` +
                                `A.I. Squirrels: ${nftData.nftCounts.squirrels || 0}\n` +
                                `A.I. Energy Apes: ${nftData.nftCounts.energy_apes || 0}\n` +
                                `RJCTD bots: ${nftData.nftCounts.rjctd_bots || 0}\n` +
                                `Candy bots: ${nftData.nftCounts.candy_bots || 0}\n` +
                                `Doodle bots: ${nftData.nftCounts.doodle_bots || 0}`
                            },
                            { name: '\u200B', value: '---------------------------------------------------------------' },
                            { name: '🎭 Server', value: 
                                `Member Since: ${message.member.joinedAt.toLocaleDateString()}\n` +
                                `Roles: ${message.member.roles.cache.size}`
                            },
                            { name: '\u200B', value: '---------------------------------------------------------------' },
                            { name: '💰 BUX Balance', value: `${(buxBalance / 1e9).toLocaleString()} BUX` },
                            { name: '🎁 Daily Rewards', value: `${dailyReward} BUX per day` },
                            { name: '💵 BUX Claim', value: `${claimableAmount} BUX available` }
                        )
                        .setFooter({ text: 'BUXDAO - Putting community first' });

                    await loadingMsg.edit({ content: null, embeds: [embed] });
                } catch (error) {
                    console.error('Profile error:', error);
                    await loadingMsg.edit('Error loading profile. Please try again later.');
                }
                break;
            }

            case 'my.wallet': {
                const userWallets = await redis.smembers(`wallets:${message.author.id}`);
                if (!userWallets || userWallets.length === 0) {
                    return message.reply('No wallets connected. Please verify your wallet first.');
                }

                const walletEmbed = new EmbedBuilder()
                    .setTitle(`${message.author.username}'s Connected Wallets`)
                    .setColor('#0099ff')
                    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                    .setDescription(userWallets.join('\n'))
                    .setFooter({ text: 'BUXDAO - Putting community first' });

                await message.reply({ embeds: [walletEmbed] });
                break;
            }

            case 'my.nfts':
                const nftData = await updateDiscordRoles(message.author.id, message.client);
                const nftEmbed = new EmbedBuilder()
                    .setTitle(`${message.author.username}'s NFT Holdings`)
                    .setColor('#0099ff')
                    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: '🎨 Main Collections', value: 
                            `Fcked Catz: ${nftData.nftCounts.fcked_catz || 0}\n` +
                            `Celeb Catz: ${nftData.nftCounts.celebcatz || 0}\n` +
                            `Money Monsters: ${nftData.nftCounts.money_monsters || 0}\n` +
                            `Money Monsters 3D: ${nftData.nftCounts.money_monsters3d || 0}\n` +
                            `AI Bitbots: ${nftData.nftCounts.ai_bitbots || 0}`
                        },
                        { name: '🤖 A.I. Collabs', value:
                            `A.I. Warriors: ${nftData.nftCounts.warriors || 0}\n` +
                            `A.I. Squirrels: ${nftData.nftCounts.squirrels || 0}\n` +
                            `A.I. Energy Apes: ${nftData.nftCounts.energy_apes || 0}\n` +
                            `RJCTD bots: ${nftData.nftCounts.rjctd_bots || 0}\n` +
                            `Candy bots: ${nftData.nftCounts.candy_bots || 0}\n` +
                            `Doodle bots: ${nftData.nftCounts.doodle_bots || 0}`
                        }
                    )
                    .setFooter({ text: 'BUXDAO - Putting community first' });
                await message.reply({ embeds: [nftEmbed] });
                break;

            case 'my.roles':
                const roleEmbed = new EmbedBuilder()
                    .setTitle(`${message.author.username}'s Server Roles`)
                    .setColor('#0099ff')
                    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                    .setDescription(message.member.roles.cache.map(role => role.name).join('\n'))
                    .setFooter({ text: 'BUXDAO - Putting community first' });
                await message.reply({ embeds: [roleEmbed] });
                break;

            case 'my.bux':
                const buxData = await updateDiscordRoles(message.author.id, message.client);
                const buxEmbed = new EmbedBuilder()
                    .setTitle(`${message.author.username}'s BUX Info`)
                    .setColor('#0099ff')
                    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: '💰 BUX Balance', value: `${buxData.buxBalance.toLocaleString()} BUX` },
                        { name: '🎁 Daily Rewards', value: `${await calculateDailyReward(buxData.nftCounts)} BUX per day` },
                        { name: '💵 BUX Claim', value: `${await getClaimableAmount(message.author.id)} BUX available` }
                    )
                    .setFooter({ text: 'BUXDAO - Putting community first' });
                await message.reply({ embeds: [buxEmbed] });
                break;

            case 'info.catz':
            case 'info.celeb':
            case 'info.mm':
            case 'info.mm3d':
            case 'info.bots':
            case 'info.bux':
                await handleInfoCommand(message, baseCommand);
                break;

            case 'rewards':
                await handleRewardsCommand(message);
                break;

            case 'test.activity':
                if (!isAdmin(message.member)) {
                    return message.reply('Admin only command');
                }

                // Test NFT sale activity
                await global.activityService.postNFTActivity({
                    type: 'sale',
                    collection: 'Fcked Catz',
                    mint: 'EPeeeDr21EPJ4GJgjuRJ8SHD4A2d59erMaTtWaTT2hqm',
                    nftNumber: '1337',
                    price: 69,
                    newOwner: 'HmgZ2zXYUnpLWMRNuDQaRWWEWERL3MxZn8K1z5iU4tiq',
                    oldOwner: 'AcWwsEwgcEHz6rzUTXcnSksFZbETtc2JhA4jF7PKjp9T',
                    image: 'https://buxdao-verify-d1faffc83da7.herokuapp.com/catz.jpg'
                });

                // Test NFT listing activity
                await global.activityService.postNFTActivity({
                    type: 'list',
                    collection: 'Money Monsters',
                    mint: '3EyhWtevHSkXg4cGsCurLLJ1NEc3rR3fWrYBx5CVLn7R',
                    nftNumber: '420',
                    price: 42.0,
                    newOwner: 'HmgZ2zXYUnpLWMRNuDQaRWWEWERL3MxZn8K1z5iU4tiq',
                    image: 'https://buxdao-verify-d1faffc83da7.herokuapp.com/mm.jpg'
                });

                // Test BUX transfer activity
                await global.activityService.postBUXActivity({
                    type: 'transfer',
                    wallet: 'HmgZ2zXYUnpLWMRNuDQaRWWEWERL3MxZn8K1z5iU4tiq',
                    change: 1000 * 1e9,
                    newBalance: 101046.161 * 1e9
                });

                await message.reply('Test activity messages sent!');
                break;

            case 'rarity': {
                if (args[0] !== 'catz' || !args[1]) {
                    return message.reply('Please use format: =rarity.catz.<number>');
                }

                const catNumber = parseInt(args[1]);
                if (isNaN(catNumber)) {
                    return message.reply('Please provide a valid cat number (e.g. =rarity.catz.25)');
                }

                try {
                    // Get all NFT keys
                    const keys = await redis.keys('nft:fcked_catz:*');
                    let targetNft = null;

                    // Find NFT with matching number
                    for (const key of keys) {
                        const data = await redis.hgetall(key);
                        if (parseInt(data.tokenId) === catNumber) {
                            targetNft = {
                                mint: key.split(':')[2],
                                ...data
                            };
                            break;
                        }
                    }

                    if (!targetNft) {
                        return message.reply(`No NFT found with number #${catNumber}`);
                    }

                    const traits = JSON.parse(targetNft.traits);
                    const traitText = traits.map(t => `${t.trait_type}: ${t.value}`).join('\n');

                    const embed = new EmbedBuilder()
                        .setTitle(`Fcked Cat #${catNumber}`)
                        .setColor('#0099ff')
                        .setImage(targetNft.image)
                        .addFields(
                            { name: 'Rarity Rank', value: `#${targetNft.rarity}`, inline: true },
                            { name: 'Owner', value: targetNft.owner },
                            { name: 'Traits', value: traitText }
                        )
                        .setFooter({ text: 'BUXDAO - Putting community first' });

                    await message.reply({ embeds: [embed] });
                } catch (error) {
                    console.error('Error fetching cat data:', error);
                    await message.reply('Error fetching NFT data');
                }
                break;
            }

            case 'rank': {
                if (args[0] !== 'catz' || !args[1]) {
                    return message.reply('Please use format: =rank.catz.<number>');
                }

                const rankNumber = parseInt(args[1]);
                if (isNaN(rankNumber)) {
                    return message.reply('Please provide a valid rank number (e.g. =rank.catz.1)');
                }

                try {
                    // Create direct Redis connection
                    const directRedis = new Redis('redis://default:9hCbki3tfd8scLZRTdGbN4FPHwUSLXyH@redis-15042.c82.us-east-1-2.ec2.redns.redis-cloud.com:15042');

                    // Get all Fcked Catz keys
                    const keys = await directRedis.keys('nft:fcked_catz:*');
                    console.log(`Found ${keys.length} total NFTs`);

                    // Get data for all NFTs
                    const nftData = [];
                    for (const key of keys) {
                        const data = await directRedis.hgetall(key);
                        if (data.rarity) {
                            nftData.push({
                                mint: key.split(':')[2],
                                ...data,
                                rarity: parseInt(data.rarity)
                            });
                        }
                    }

                    console.log('First few NFTs before sorting:', nftData.slice(0, 3));

                    // Sort by rarity rank (lowest to highest)
                    nftData.sort((a, b) => {
                        // Convert rarity strings to numbers and compare
                        const rankA = parseInt(a.rarity);
                        const rankB = parseInt(b.rarity);
                        return rankA - rankB;
                    });

                    console.log('First few NFTs after sorting:', nftData.slice(0, 3));

                    // Find NFT with matching rank
                    const nft = nftData[rankNumber - 1]; // Adjust index since ranks start at 1
                    
                    if (!nft) {
                        await directRedis.quit();
                        return message.reply(`No NFT found with rank ${rankNumber}`);
                    }

                    // Create embed
                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle(`Fcked Cat #${nft.tokenId}`)
                        .setImage(nft.image)
                        .addFields(
                            { name: 'Rarity Rank', value: `#${nft.rarity}`, inline: true },
                            { name: 'Owner', value: nft.owner, inline: true }
                        );

                    if (nft.traits) {
                        const traits = JSON.parse(nft.traits);
                        embed.addFields(
                            { name: 'Traits', value: traits.map(t => `${t.trait_type}: ${t.value}`).join('\n') }
                        );
                    }

                    await directRedis.quit();
                    return message.reply({ embeds: [embed] });

                } catch (error) {
                    console.error('Error in rank command:', error);
                    return message.reply('Error fetching NFT data');
                }
            }

            default:
                await message.reply('Unknown command. Use =help to see available commands.');
                break;
        }
    } catch (error) {
        console.error(`Command error: ${baseCommand}`, error);
        await message.reply('An error occurred while processing your command');
    }
}

async function handleInfoCommand(message, command) {
    const infoEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setFooter({ text: 'BUXDAO - Putting community first' });

    switch(command) {
        case 'info.catz':
            infoEmbed
                .setTitle('Fcked Catz Info')
                .setDescription('The OG collection that started it all!')
                .addFields(
                    { name: 'Supply', value: '3,333' },
                    { name: 'Daily Reward', value: '5 BUX per NFT' }
                );
            break;
        // ... Add other collection info cases
    }

    await message.reply({ embeds: [infoEmbed] });
}

async function handleRewardsCommand(message) {
    const rewardsEmbed = new EmbedBuilder()
        .setTitle('BUXDAO Daily Rewards')
        .setColor('#0099ff')
        .addFields(
            { name: 'AI Collabs', value: '1 BUX per NFT per day' },
            { name: 'AI Bitbots', value: '3 BUX per NFT per day' },
            { name: 'Main Collections', value: '5 BUX per NFT per day' },
            { name: 'Money Monsters 3D', value: '10 BUX per NFT per day' },
            { name: 'Celeb Catz', value: '15 BUX per NFT per day' }
        )
        .setFooter({ text: 'BUXDAO - Putting community first' });

    await message.reply({ embeds: [rewardsEmbed] });
}

export { handleCommand };
