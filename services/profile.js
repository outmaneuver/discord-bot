import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import { updateDiscordRoles, checkNFTOwnership, getBUXBalance, redis } from './verify.js';
import { startOrUpdateDailyTimer, getTimeUntilNextClaim } from './rewards.js';
import ms from 'ms';

// Add caching for NFT data
const NFT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Update getCachedNFTData function to properly handle NFT data
const getCachedNFTData = async (walletAddress) => {
  try {
    // Get cached data
    const cached = await redis.hgetall(`wallet:${walletAddress}:nfts`);
    if (cached && Object.keys(cached).length > 0) {
      console.log('Using cached NFT data for wallet:', walletAddress);
      return {
        fcked_catz: JSON.parse(cached.fcked_catz || '[]'),
        celebcatz: JSON.parse(cached.celebcatz || '[]'),
        money_monsters: JSON.parse(cached.money_monsters || '[]'),
        money_monsters3d: JSON.parse(cached.money_monsters3d || '[]'),
        ai_bitbots: JSON.parse(cached.ai_bitbots || '[]')
      };
    }
    
    console.log('Cache miss - checking NFT ownership for wallet:', walletAddress);
    const data = await checkNFTOwnership(walletAddress);
    
    // Cache the results
    const pipeline = redis.pipeline();
    pipeline.hset(`wallet:${walletAddress}:nfts`, {
      fcked_catz: JSON.stringify(data.fcked_catz),
      celebcatz: JSON.stringify(data.celebcatz),
      money_monsters: JSON.stringify(data.money_monsters),
      money_monsters3d: JSON.stringify(data.money_monsters3d),
      ai_bitbots: JSON.stringify(data.ai_bitbots)
    });
    pipeline.expire(`wallet:${walletAddress}:nfts`, NFT_CACHE_TTL / 1000);
    await pipeline.exec();
    
    return data;
  } catch (error) {
    console.error('Error getting cached NFT data:', error);
    throw error;
  }
};

// Export functions individually
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

export async function updateUserProfile(channel, userId, client) {
  try {
    // Get wallet data
    const walletData = await getWalletData(userId);
    if (!walletData || !walletData.walletAddresses) {
      throw new Error('Failed to get wallet data');
    }
    console.log(`Processing profile for user ${userId} with wallets:`, walletData.walletAddresses);

    // Clear any cached NFT data
    await redis.del(`user:${userId}:nfts`);
    for (const wallet of walletData.walletAddresses) {
      await redis.del(`wallet:${wallet}:nfts`);
    }

    // Force a fresh check of NFTs and roles
    await updateDiscordRoles(userId, client);

    // Get fresh NFT data after role update
    const nftData = await redis.hgetall(`user:${userId}:nfts`);
    const nftCounts = {
      fcked_catz: JSON.parse(nftData.fcked_catz || '[]').length,
      celebcatz: JSON.parse(nftData.celebcatz || '[]').length,
      money_monsters: JSON.parse(nftData.money_monsters || '[]').length,
      money_monsters3d: JSON.parse(nftData.money_monsters3d || '[]').length,
      ai_bitbots: JSON.parse(nftData.ai_bitbots || '[]').length
    };

    // Get guild and member
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) throw new Error('Guild not found');

    const member = await guild.members.fetch(userId);
    if (!member) throw new Error('Member not found');

    // Get roles
    const roles = member.roles.cache
      .filter(role => role.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(role => role.name)
      .join('\n');

    // Get BUX balance
    let buxBalance = 0;
    for (const wallet of walletData.walletAddresses) {
      const balance = await getBUXBalance(wallet);
      buxBalance += balance;
    }

    // Get timer data
    const [timerData, timeUntilNext] = await Promise.all([
      startOrUpdateDailyTimer(userId, nftCounts, buxBalance),
      getTimeUntilNextClaim(userId)
    ]);

    // Calculate daily reward
    const dailyReward = calculateDailyReward(nftCounts);

    // Create embed
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
          name: 'NFTs', 
          value: Object.entries(nftCounts)
            .map(([collection, count]) => `${collection}: ${count}`)
            .join('\n') || 'No NFTs' 
        },
        { name: '\u200B', value: '─'.repeat(40) },
        {
          name: 'Server Roles',
          value: roles || 'No roles'
        },
        { name: '\u200B', value: '─'.repeat(40) },
        { 
          name: 'BUX Balance', 
          value: `${buxBalance.toLocaleString()} BUX` 
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

    // Send message
    await channel.send({ embeds: [embed] });

  } catch (error) {
    console.error('Error updating user profile:', error);
    await channel.send('An error occurred while processing your command. Please try again later.');
  }
}

export function formatNFTCounts(nftCounts) {
  return Object.entries(nftCounts)
    .map(([collection, nfts]) => `${collection}: ${nfts.length}`)
    .join('\n');
}

export function calculateDailyReward(nftCounts) {
  let reward = 0;
  
  // Updated reward multipliers
  reward += nftCounts.fcked_catz.length * 2;      // 2 BUX per FCatz
  reward += nftCounts.celebcatz.length * 8;       // 8 BUX per CelebCatz
  reward += nftCounts.money_monsters.length * 2;   // 2 BUX per MM
  reward += nftCounts.money_monsters3d.length * 4; // 4 BUX per MM3D
  reward += nftCounts.ai_bitbots.length * 1;      // 1 BUX per AI Bitbot

  return reward;
}

// Update aggregateWalletData function to prevent double counting
export async function aggregateWalletData(walletData) {
  // Initialize with Sets to prevent duplicates
  const nftSets = {
    fcked_catz: new Set(),
    celebcatz: new Set(),
    money_monsters: new Set(),
    money_monsters3d: new Set(),
    ai_bitbots: new Set()
  };
  let totalBuxBalance = 0;

  // Add delay between RPC calls
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Track all NFTs to prevent duplicates
  const processedNFTs = new Set();

  for (const walletAddress of walletData.walletAddresses) {
    try {
      console.log('Aggregating data for wallet:', walletAddress);

      // Get NFT data with retries
      let nftData;
      let retries = 3;
      while (retries > 0) {
        try {
          nftData = await getCachedNFTData(walletAddress);
          console.log('NFT data for wallet', walletAddress + ':', nftData);
          break;
        } catch (error) {
          console.error(`Error getting NFT data (attempt ${4-retries}/3):`, error);
          if (error.message.includes('429') && retries > 1) {
            await delay((4-retries) * 2000);
            retries--;
            continue;
          }
          break;
        }
      }

      if (!nftData) continue;

      // Add NFTs to Sets only if not already processed
      Object.entries(nftData).forEach(([collection, nfts]) => {
        if (Array.isArray(nfts)) {
          nfts.forEach(nft => {
            if (typeof nft === 'string' && nft.length > 0 && !processedNFTs.has(nft)) {
              nftSets[collection].add(nft);
              processedNFTs.add(nft); // Track this NFT as processed
              console.log(`Added ${collection} NFT: ${nft}`);
            }
          });
        }
      });

      // Get BUX balance
      try {
        const balance = await getBUXBalance(walletAddress);
        totalBuxBalance += balance;
      } catch (error) {
        console.error('Error getting BUX balance:', error);
      }

      await delay(1000); // Delay between wallets
    } catch (error) {
      console.error('Error processing wallet:', walletAddress, error);
    }
  }

  // Convert Sets to arrays
  const nftCounts = {
    fcked_catz: Array.from(nftSets.fcked_catz),
    celebcatz: Array.from(nftSets.celebcatz),
    money_monsters: Array.from(nftSets.money_monsters),
    money_monsters3d: Array.from(nftSets.money_monsters3d),
    ai_bitbots: Array.from(nftSets.ai_bitbots)
  };

  // Log counts for debugging
  console.log('Final NFT counts after deduplication:', {
    fcked_catz: nftCounts.fcked_catz.length,
    celebcatz: nftCounts.celebcatz.length,
    money_monsters: nftCounts.money_monsters.length,
    money_monsters3d: nftCounts.money_monsters3d.length,
    ai_bitbots: nftCounts.ai_bitbots.length
  });
  console.log('Total BUX balance:', totalBuxBalance);

  return {
    nftCounts,
    buxBalance: totalBuxBalance
  };
}
