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
    const hasAdminRole = member.roles.cache.has('948256376793235507');
    console.log(`Checking admin role for ${member.user.username}: ${hasAdminRole}`);
    return hasAdminRole;
}

// Add command cooldowns
const commandCooldowns = new Map();

// Command handler
async function handleCommand(message) {
    const command = message.content.slice(1).split(' ')[0];
    
    // Check cooldown
    const cooldown = commandCooldowns.get(`${message.author.id}-${command}`);
    if (cooldown && Date.now() < cooldown) {
        return message.reply('Please wait before using this command again');
    }

    // Set cooldown (30 seconds)
    commandCooldowns.set(`${message.author.id}-${command}`, Date.now() + 30000);

    const args = message.content.toLowerCase().split(' ');
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
        switch(command) {
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
                const connectedWallets = await redis.smembers(`wallets:${targetUser.id}`);
                if (!connectedWallets || connectedWallets.length === 0) {
                    return message.reply('No wallets connected. Please verify your wallet first.');
                }

                // Add loading message
                const loadingMsg = await message.reply('Loading profile data...');

                try {
                    const nftData = await updateDiscordRoles(targetUser.id, message.client);
                    if (!nftData || !nftData.nftCounts) {
                        await loadingMsg.edit('Error loading NFT data. Please try again later.');
                        return;
                    }

                    const buxBalance = nftData.buxBalance;
                    const dailyReward = await calculateDailyReward(nftData.nftCounts);
                    const claimableAmount = await getClaimableAmount(targetUser.id);

                    const embed = new EmbedBuilder()
                        .setTitle(`${targetUser.username}'s BUXDAO Profile`)
                        .setColor('#0099ff')
                        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
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
                                `Member Since: ${targetMember.joinedAt.toLocaleDateString()}\n` +
                                `Roles: ${targetMember.roles.cache.size}`
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
                const userWallets = await redis.smembers(`wallets:${targetUser.id}`);
                if (!userWallets || userWallets.length === 0) {
                    return message.reply('No wallets connected. Please verify your wallet first.');
                }

                const walletEmbed = new EmbedBuilder()
                    .setTitle(`${targetUser.username}'s Connected Wallets`)
                    .setColor('#0099ff')
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                    .setDescription(userWallets.join('\n'))
                    .setFooter({ text: 'BUXDAO - Putting community first' });

                await message.reply({ embeds: [walletEmbed] });
                break;
            }

            case 'my.nfts':
                const nftData = await updateDiscordRoles(targetUser.id, message.client);
                const nftEmbed = new EmbedBuilder()
                    .setTitle(`${targetUser.username}'s NFT Holdings`)
                    .setColor('#0099ff')
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
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
                    .setTitle(`${targetUser.username}'s Server Roles`)
                    .setColor('#0099ff')
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                    .setDescription(targetMember.roles.cache.map(role => role.name).join('\n'))
                    .setFooter({ text: 'BUXDAO - Putting community first' });
                await message.reply({ embeds: [roleEmbed] });
                break;

            case 'my.bux':
                const buxData = await updateDiscordRoles(targetUser.id, message.client);
                const buxEmbed = new EmbedBuilder()
                    .setTitle(`${targetUser.username}'s BUX Info`)
                    .setColor('#0099ff')
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: '💰 BUX Balance', value: `${buxData.buxBalance.toLocaleString()} BUX` },
                        { name: '🎁 Daily Rewards', value: `${await calculateDailyReward(buxData.nftCounts)} BUX per day` },
                        { name: '💵 BUX Claim', value: `${await getClaimableAmount(targetUser.id)} BUX available` }
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
                await handleInfoCommand(message, command);
                break;

            case 'rewards':
                await handleRewardsCommand(message);
                break;

            case 'test.activity':
                if (!isAdmin(message.member)) {
                    return message.reply('Admin only command');
                }

                await global.activityService.postNFTActivity({
                    type: 'transfer',
                    collection: 'Fcked Catz',
                    mint: 'ABC123...',
                    newOwner: 'NewOwner123...',
                    oldOwner: 'OldOwner123...'
                });

                await global.activityService.postBUXActivity({
                    type: 'transfer',
                    wallet: 'TestWallet123...',
                    change: 1000 * 1e9,
                    newBalance: 5000 * 1e9
                });

                await message.reply('Test activity messages sent!');
                break;

            default:
                await message.reply('Unknown command. Use =help to see available commands.');
                break;
        }
    } catch (error) {
        console.error(`Command error: ${command}`, error);
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
