import { EmbedBuilder } from 'discord.js';
import { updateDiscordRoles, hashlists } from './verify.js';
import { redis } from '../config/redis.js';
import { startOrUpdateDailyTimer, getTimeUntilNextClaim, calculateDailyReward } from './rewards.js';

// Only export what's needed
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

    // Initialize NFT counts
    const nftCounts = {
      fcked_catz: new Set(),
      celebcatz: new Set(),
      money_monsters: new Set(),
      money_monsters3d: new Set(),
      ai_bitbots: new Set(),
      warriors: new Set(),
      squirrels: new Set(),
      rjctd_bots: new Set(),
      energy_apes: new Set(),
      doodle_bots: new Set(),
      candy_bots: new Set()
    };

    let totalBuxBalance = 0;

    // Get cached NFT data for each wallet
    for (const walletAddress of walletData.walletAddresses) {
      // Get cached NFT data
      const cachedNFTs = await redis.hgetall(`wallet:${walletAddress}:nfts`);
      if (cachedNFTs) {
        Object.entries(cachedNFTs).forEach(([collection, mints]) => {
          const mintArray = JSON.parse(mints);
          mintArray.forEach(mint => {
            if (hashlists.fckedCatz?.has(mint)) nftCounts.fcked_catz.add(mint);
            if (hashlists.celebCatz?.has(mint)) nftCounts.celebcatz.add(mint);
            if (hashlists.moneyMonsters?.has(mint)) nftCounts.money_monsters.add(mint);
            if (hashlists.moneyMonsters3d?.has(mint)) nftCounts.money_monsters3d.add(mint);
            if (hashlists.aiBitbots?.has(mint)) nftCounts.ai_bitbots.add(mint);
            if (hashlists.warriors?.has(mint)) nftCounts.warriors.add(mint);
            if (hashlists.squirrels?.has(mint)) nftCounts.squirrels.add(mint);
            if (hashlists.rjctdBots?.has(mint)) nftCounts.rjctd_bots.add(mint);
            if (hashlists.energyApes?.has(mint)) nftCounts.energy_apes.add(mint);
            if (hashlists.doodleBots?.has(mint)) nftCounts.doodle_bots.add(mint);
            if (hashlists.candyBots?.has(mint)) nftCounts.candy_bots.add(mint);
          });
        });
      }

      // Get cached BUX balance
      const buxBalance = parseInt(await redis.get(`wallet:${walletAddress}:bux`) || '0');
      totalBuxBalance += buxBalance;
    }

    // Update Discord roles
    console.log('Updating roles for user:', userId);
    await updateDiscordRoles(userId, client);

    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) throw new Error('Guild not found');

    const member = await guild.members.fetch(userId);
    if (!member) throw new Error('Member not found');

    const roles = member.roles.cache
      .filter(role => role.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(role => role.name)
      .join('\n');

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
            `Fcked Catz: ${nftCounts.fcked_catz.size}`,
            `CelebCatz: ${nftCounts.celebcatz.size}`,
            `Money Monsters: ${nftCounts.money_monsters.size}`,
            `Money Monsters 3D: ${nftCounts.money_monsters3d.size}`,
            `AI Bitbots: ${nftCounts.ai_bitbots.size}`
          ].join('\n') || 'No NFTs'
        },
        { name: '\u200B', value: '─'.repeat(40) },
        {
          name: 'A.I. Collabs',
          value: [
            `A.I. Warriors: ${nftCounts.warriors.size}`,
            `A.I. Squirrels: ${nftCounts.squirrels.size}`,
            `A.I. Energy Apes: ${nftCounts.energy_apes.size}`,
            `RJCTD Bots: ${nftCounts.rjctd_bots.size}`,
            `Candy Bots: ${nftCounts.candy_bots.size}`,
            `Doodle Bots: ${nftCounts.doodle_bots.size}`
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
