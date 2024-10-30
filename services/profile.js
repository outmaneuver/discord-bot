import { EmbedBuilder } from 'discord.js';
import { updateDiscordRoles, hashlists } from './verify.js';
import { redis } from '../config/redis.js';
import { startOrUpdateDailyTimer, getTimeUntilNextClaim, calculateDailyReward } from './rewards.js';

export async function getWalletData(userId) {
  try {
    const wallets = await redis.smembers(`wallets:${userId}`);
    console.log(`Retrieved wallets for user ${userId}:`, wallets);
    return { walletAddresses: wallets || [] };
  } catch (error) {
    console.error('Error getting wallet data:', error);
    return { walletAddresses: [] };
  }
}

export async function updateUserProfile(channel, userId, client) {
  try {
    const walletData = await getWalletData(userId);
    if (!walletData || walletData.walletAddresses.length === 0) {
      throw new Error('No wallets connected');
    }
    console.log(`Processing profile for user ${userId} with wallets:`, walletData.walletAddresses);

    // Get NFT counts from updateDiscordRoles
    const roleUpdateResult = await updateDiscordRoles(userId, client);
    console.log('Role update result:', roleUpdateResult);

    // Get BUX balance from Redis
    let totalBuxBalance = 0;
    for (const wallet of walletData.walletAddresses) {
      const buxBalance = parseInt(await redis.get(`bux:${wallet}`) || '0');
      totalBuxBalance += buxBalance;
    }

    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) throw new Error('Guild not found');

    const member = await guild.members.fetch(userId);
    if (!member) throw new Error('Member not found');

    const roles = member.roles.cache
      .filter(role => role.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(role => role.name)
      .join('\n');

    // Use NFT counts from role update result
    const nftCounts = roleUpdateResult.nftCounts;
    console.log('NFT counts:', nftCounts);

    const dailyReward = await calculateDailyReward(nftCounts, totalBuxBalance);

    const [timerData, timeUntilNext] = await Promise.all([
      startOrUpdateDailyTimer(userId, nftCounts, totalBuxBalance),
      getTimeUntilNextClaim(userId)
    ]);

    // Create and send embed
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`${member.user.username}'s BUX DAO Profile`)
      .addFields(
        { 
          name: 'Connected Wallets', 
          value: walletData.walletAddresses.join('\n') || 'No wallets connected' 
        },
        { name: '\u200B', value: '─'.repeat(40) },
        { 
          name: 'Main Collections', 
          value: [
            `Fcked Catz: ${nftCounts.fcked_catz}`,
            `CelebCatz: ${nftCounts.celebcatz}`,
            `Money Monsters: ${nftCounts.money_monsters}`,
            `Money Monsters 3D: ${nftCounts.money_monsters3d}`,
            `AI Bitbots: ${nftCounts.ai_bitbots}`
          ].join('\n') || 'No NFTs'
        },
        { name: '\u200B', value: '─'.repeat(40) },
        {
          name: 'A.I. Collabs',
          value: [
            `A.I. Warriors: ${nftCounts.warriors}`,
            `A.I. Squirrels: ${nftCounts.squirrels}`,
            `A.I. Energy Apes: ${nftCounts.energy_apes}`,
            `RJCTD Bots: ${nftCounts.rjctd_bots}`,
            `Candy Bots: ${nftCounts.candy_bots}`,
            `Doodle Bots: ${nftCounts.doodle_bots}`
          ].join('\n') || 'No A.I. Collab NFTs'
        },
        { name: '\u200B', value: '─'.repeat(40) },
        {
          name: 'Server Roles',
          value: roles || 'No roles'
        },
        { name: '\u200B', value: '─'.repeat(40) },
        { 
          name: 'BUX Balance', 
          value: `${totalBuxBalance.toLocaleString()} BUX`
        },
        { 
          name: 'Daily Reward', 
          value: `${dailyReward.toLocaleString()} BUX` 
        },
        { 
          name: 'BUX Claim', 
          value: `${timerData.claimAmount.toLocaleString()} BUX` 
        },
        { 
          name: 'Claim updates in', 
          value: timeUntilNext || 'Start timer by verifying wallet'
        }
      );

    await channel.send({ embeds: [embed] });

  } catch (error) {
    console.error('Error updating user profile:', error);
    await channel.send('An error occurred while processing your command. Please try again later.');
  }
}
