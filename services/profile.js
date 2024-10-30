import { EmbedBuilder } from 'discord.js';
import { updateDiscordRoles } from './verify.js';
import { redis } from '../config/redis.js';
import { startOrUpdateDailyTimer, getTimeUntilNextClaim, calculateDailyReward } from './rewards.js';

export async function getWalletData(userId) {
  try {
    const wallets = await redis.smembers(`wallets:${userId}`);
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

    // Get NFT counts from updateDiscordRoles
    const roleUpdate = await updateDiscordRoles(userId, client);
    console.log('Role update result:', roleUpdate);

    // Extract nftCounts from roleUpdate - handle both object and boolean returns
    const nftCounts = roleUpdate?.nftCounts || {
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

    // Get BUX balance from Redis and refresh from chain
    let totalBuxBalance = 0;
    for (const wallet of walletData.walletAddresses) {
      // Get fresh balance from chain
      const chainBalance = await getBUXBalance(wallet);
      console.log('Chain BUX balance for wallet:', wallet, chainBalance);
      
      // Get cached balance from Redis
      const cachedBalance = parseInt(await redis.get(`bux:${wallet}`) || '0');
      console.log('Cached BUX balance for wallet:', wallet, cachedBalance);
      
      // Use chain balance if available, otherwise use cached
      const balance = chainBalance || cachedBalance;
      totalBuxBalance += balance;
    }

    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) throw new Error('Guild not found');

    const member = await guild.members.fetch(userId);
    if (!member) throw new Error('Member not found');

    const roles = member.roles.cache
      .filter(role => role.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(role => role.name)
      .join('\n') || 'No roles';

    const dailyReward = await calculateDailyReward(nftCounts, totalBuxBalance);
    const [timerData, timeUntilNext] = await Promise.all([
      startOrUpdateDailyTimer(userId, nftCounts, totalBuxBalance),
      getTimeUntilNextClaim(userId)
    ]);

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
            `Fcked Catz: ${nftCounts.fcked_catz || 0}`,
            `CelebCatz: ${nftCounts.celebcatz || 0}`,
            `Money Monsters: ${nftCounts.money_monsters || 0}`,
            `Money Monsters 3D: ${nftCounts.money_monsters3d || 0}`,
            `AI Bitbots: ${nftCounts.ai_bitbots || 0}`
          ].join('\n') || 'No NFTs'
        },
        { name: '\u200B', value: '─'.repeat(40) },
        {
          name: 'A.I. Collabs',
          value: [
            `A.I. Warriors: ${nftCounts.warriors || 0}`,
            `A.I. Squirrels: ${nftCounts.squirrels || 0}`,
            `A.I. Energy Apes: ${nftCounts.energy_apes || 0}`,
            `RJCTD Bots: ${nftCounts.rjctd_bots || 0}`,
            `Candy Bots: ${nftCounts.candy_bots || 0}`,
            `Doodle Bots: ${nftCounts.doodle_bots || 0}`
          ].join('\n') || 'No NFTs'
        },
        { name: '\u200B', value: '─'.repeat(40) },
        {
          name: 'Server Roles',
          value: roles
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
          value: `${(timerData?.claimAmount || 0).toLocaleString()} BUX` 
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
