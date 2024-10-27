import { EmbedBuilder } from 'discord.js';
import { updateDiscordRoles, checkNFTOwnership, getBUXBalance } from './verify.js';
import { startOrUpdateDailyTimer, getTimeUntilNextClaim } from './rewards.js';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  }
});

// Export getWalletData function
export async function getWalletData(userId) {
  try {
    // Get wallet addresses as a Set from Redis
    const wallets = await redis.smembers(`user:${userId}:wallets`);
    console.log(`Retrieved wallets for user ${userId}:`, wallets);
    return { walletAddresses: wallets || [] };
  } catch (error) {
    console.error('Error getting wallet data:', error);
    return { walletAddresses: [] };
  }
}

export async function addWallet(userId, walletAddress) {
  try {
    await redis.sadd(`user:${userId}:wallets`, walletAddress);
    return true;
  } catch (error) {
    console.error('Error adding wallet:', error);
    return false;
  }
}

export async function removeWallet(userId, walletAddress) {
  try {
    await redis.srem(`user:${userId}:wallets`, walletAddress);
    return true;
  } catch (error) {
    console.error('Error removing wallet:', error);
    return false;
  }
}

async function aggregateWalletData(walletData) {
  const aggregatedData = {
    nftCounts: {
      fcked_catz: [],
      celebcatz: [],
      money_monsters: [],
      money_monsters3d: [],
      ai_bitbots: []
    },
    buxBalance: 0
  };

  for (const walletAddress of walletData.walletAddresses) {
    try {
      console.log('Aggregating data for wallet:', walletAddress);
      
      // Get NFT data
      const nftCounts = await checkNFTOwnership(walletAddress);
      console.log('NFT counts for wallet', walletAddress + ':', nftCounts);
      
      // Merge NFT arrays
      Object.keys(nftCounts).forEach(collection => {
        aggregatedData.nftCounts[collection] = [
          ...aggregatedData.nftCounts[collection],
          ...nftCounts[collection]
        ];
      });

      // Get BUX balance
      const balance = await getBUXBalance(walletAddress);
      console.log('BUX balance for wallet', walletAddress + ':', balance);
      aggregatedData.buxBalance += balance;

    } catch (error) {
      console.error('Error aggregating data for wallet', walletAddress + ':', error);
    }
  }

  console.log('Aggregated NFT counts:', aggregatedData.nftCounts);
  console.log('Total BUX balance:', aggregatedData.buxBalance);
  return aggregatedData;
}

export async function updateUserProfile(channel, userId, client) {
  try {
    const walletData = await getWalletData(userId);
    const aggregatedData = await aggregateWalletData(walletData);
    
    const user = await client.users.fetch(userId);
    const username = user.username;

    const timerData = await startOrUpdateDailyTimer(userId, aggregatedData.nftCounts, aggregatedData.buxBalance);
    const timeUntilNext = await getTimeUntilNextClaim(userId);
    
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`${username}'s Updated BUX DAO Profile`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }))
      .addFields(
        { name: 'Connected Wallets', value: walletData.walletAddresses.join('\n') || 'No wallets connected' },
        { name: '\u200B', value: '─'.repeat(40) },
        { name: 'NFTs', value: formatNFTCounts(aggregatedData.nftCounts) || 'No NFTs' },
        { name: '\u200B', value: '─'.repeat(40) },
        { name: 'BUX Balance', value: `${aggregatedData.buxBalance} BUX` },
        { name: 'BUX Claim', value: `${timerData.claimAmount} BUX` },
        { name: 'Next Claim', value: timeUntilNext ? `Updates in ${timeUntilNext}` : 'Start timer by verifying wallet' }
      );

    await channel.send({ embeds: [embed] });
    await updateDiscordRoles(userId, aggregatedData, client);
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
}

function formatNFTCounts(nftCounts) {
  return Object.entries(nftCounts)
    .map(([collection, nfts]) => `${collection}: ${nfts.length}`)
    .join('\n');
}
