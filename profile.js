import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import { updateDiscordRoles, checkNFTOwnership, getBUXBalance } from './verify.js';
import { startOrUpdateDailyTimer, getTimeUntilNextClaim } from './rewards.js';
import Redis from 'ioredis';
import ms from 'ms';

const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  }
});

// Export getWalletData function
export async function getWalletData(userId) {
  try {
    // Get wallet addresses from Redis - use the correct key format
    const wallets = await redis.smembers(`wallets:${userId}`);
    console.log(`Retrieved wallets for user ${userId}:`, wallets);
    return { walletAddresses: wallets || [] };
  } catch (error) {
    console.error('Error getting wallet data:', error);
    return { walletAddresses: [] };
  }
}

export async function addWallet(userId, walletAddress) {
  try {
    // Use the correct key format
    await redis.sadd(`wallets:${userId}`, walletAddress);
    return true;
  } catch (error) {
    console.error('Error adding wallet:', error);
    return false;
  }
}

export async function removeWallet(userId, walletAddress) {
  try {
    // Use the correct key format
    await redis.srem(`wallets:${userId}`, walletAddress);
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

  // Add delay between RPC calls to avoid rate limiting
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  
  for (const walletAddress of walletData.walletAddresses) {
    try {
      console.log('Aggregating data for wallet:', walletAddress);
      
      // Get NFT data with retries
      let nftCounts;
      let retries = 3;
      while (retries > 0) {
        try {
          nftCounts = await checkNFTOwnership(walletAddress);
          break;
        } catch (error) {
          if (error.message.includes('429') && retries > 1) {
            console.log(`Rate limited, retrying in ${(4-retries)*2}s...`);
            await delay((4-retries) * 2000);
            retries--;
            continue;
          }
          throw error;
        }
      }
      
      console.log('NFT counts for wallet', walletAddress + ':', nftCounts);
      
      // Merge NFT arrays
      Object.keys(nftCounts).forEach(collection => {
        aggregatedData.nftCounts[collection] = [
          ...aggregatedData.nftCounts[collection],
          ...nftCounts[collection]
        ];
      });

      // Get BUX balance with retries
      let balance;
      retries = 3;
      while (retries > 0) {
        try {
          balance = await getBUXBalance(walletAddress);
          break;
        } catch (error) {
          if (error.message.includes('429') && retries > 1) {
            console.log(`Rate limited, retrying in ${(4-retries)*2}s...`);
            await delay((4-retries) * 2000);
            retries--;
            continue;
          }
          throw error;
        }
      }
      
      console.log('BUX balance for wallet', walletAddress + ':', balance);
      aggregatedData.buxBalance += balance;

      // Add delay between wallets
      await delay(1000);

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

    // Calculate daily reward based on NFT holdings
    const dailyReward = calculateDailyReward(aggregatedData.nftCounts);
    
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`${username}'s BUX DAO Profile`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }))
      .addFields(
        { 
          name: 'Connected Wallets', 
          value: walletData.walletAddresses.length > 0 ? 
            walletData.walletAddresses.join('\n') : 
            'No wallets connected' 
        },
        { name: '\u200B', value: '─'.repeat(40) },
        { 
          name: 'NFTs', 
          value: formatNFTCounts(aggregatedData.nftCounts) || 'No NFTs' 
        },
        { name: '\u200B', value: '─'.repeat(40) },
        { 
          name: 'BUX Balance', 
          value: `${aggregatedData.buxBalance.toLocaleString()} BUX` 
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
          value: timeUntilNext || 'Start timer by verifying wallet',
          inline: true 
        }
      );

    // Create claim button (disabled for now)
    const claimButton = new ButtonBuilder()
      .setCustomId('claim_bux')
      .setLabel('CLAIM')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true);

    const row = new ActionRowBuilder()
      .addComponents(claimButton);

    await channel.send({ 
      embeds: [embed],
      components: [row]
    });
    
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

function calculateDailyReward(nftCounts) {
  let reward = 0;
  
  // Add reward for each NFT type
  reward += nftCounts.fcked_catz.length * 10;    // 10 BUX per FCatz
  reward += nftCounts.celebcatz.length * 20;     // 20 BUX per CelebCatz
  reward += nftCounts.money_monsters.length * 15; // 15 BUX per MM
  reward += nftCounts.money_monsters3d.length * 25; // 25 BUX per MM3D
  reward += nftCounts.ai_bitbots.length * 30;    // 30 BUX per AI Bitbot

  return reward;
}
