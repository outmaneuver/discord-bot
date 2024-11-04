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
            case 'my.profile':
                const wallets = await redis.smembers(`wallets:${targetUser.id}`);
                if (!wallets || wallets.length === 0) {
                    return message.reply('No wallets connected. Please verify your wallet first.');
                }

                const nftData = await updateDiscordRoles(targetUser.id, message.client);
                const buxBalance = await getBUXBalance(wallets[0]); // Get BUX balance of first wallet
                const buxValue = await getBUXValue();
                const usdValue = (buxBalance * buxValue).toFixed(2);

                const embed = new EmbedBuilder()
                    .setTitle(`${targetUser.username}'s BUXDAO Profile`)
                    .setColor('#0099ff')
                    .addFields(
                        { name: '🏦 Connected Wallets', value: wallets.join('\n') || 'None' },
                        { name: '\u200B', value: '---------------------------------------------------------------' },
                        { name: '🎨 Main Collections', value: 
                            `Fcked Catz: ${nftData.nftCounts.fcked_catz}\n` +
                            `Celeb Catz: ${nftData.nftCounts.celebcatz}\n` +
                            `Money Monsters: ${nftData.nftCounts.money_monsters}\n` +
                            `Money Monsters 3D: ${nftData.nftCounts.money_monsters3d}\n` +
                            `AI Bitbots: ${nftData.nftCounts.ai_bitbots}`
                        },
                        { name: '\u200B', value: '---------------------------------------------------------------' },
                        { name: '🤖 A.I. Collabs', value:
                            `A.I. Warriors: ${nftData.nftCounts.warriors}\n` +
                            `A.I. Squirrels: ${nftData.nftCounts.squirrels}\n` +
                            `A.I. Energy Apes: ${nftData.nftCounts.energy_apes}\n` +
                            `RJCTD bots: ${nftData.nftCounts.rjctd_bots}\n` +
                            `Candy bots: ${nftData.nftCounts.candy_bots}\n` +
                            `Doodle bots: ${nftData.nftCounts.doodle_bots}`
                        },
                        { name: '\u200B', value: '---------------------------------------------------------------' },
                        { name: '🎭 Server', value: 
                            `Member Since: ${targetMember.joinedAt.toLocaleDateString()}\n` +
                            `Roles: ${targetMember.roles.cache.size}`
                        },
                        { name: '\u200B', value: '---------------------------------------------------------------' },
                        { name: '💰 BUX Balance', value: `${buxBalance.toLocaleString()} BUX ($${usdValue})` }
                    )
                    .setFooter({ text: 'BUXDAO - Putting community first' });

                await message.reply({ embeds: [embed] });
                break;

            // Add other commands here
            default:
                await message.reply('Unknown command');
                break;
        }
    } catch (error) {
        console.error(`Command error: ${command}`, error);
        await message.reply('An error occurred while processing your command');
    }
}

export { handleCommand };
