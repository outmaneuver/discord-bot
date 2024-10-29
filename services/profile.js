import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import { updateDiscordRoles, checkNFTOwnership, getBUXBalance, redis } from './verify.js';
import { startOrUpdateDailyTimer, getTimeUntilNextClaim } from './rewards.js';
import ms from 'ms';

// Add caching for NFT data
const NFT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCachedNFTData = async (walletAddress) => {
  const cached = await redis.get(`nft:${walletAddress}`);
  if (cached) return JSON.parse(cached);
  
  const data = await checkNFTOwnership(walletAddress);
  await redis.setex(`nft:${walletAddress}`, NFT_CACHE_TTL / 1000, JSON.stringify(data));
  return data;
};

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
          nftCounts = await getCachedNFTData(walletAddress);
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
    // Get wallet data with error handling
    const walletData = await getWalletData(userId);
    if (!walletData || !walletData.walletAddresses) {
      throw new Error('Failed to get wallet data');
    }
    console.log(`Processing profile for user ${userId} with wallets:`, walletData.walletAddresses);

    // Get aggregated data with error handling
    const aggregatedData = await aggregateWalletData(walletData);
    if (!aggregatedData) {
      throw new Error('Failed to aggregate wallet data');
    }

    // Fetch user with error handling
    const user = await client.users.fetch(userId).catch(error => {
      console.error('Error fetching user:', error);
      throw new Error('Failed to fetch user data');
    });

    // Get guild with error handling
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) {
      throw new Error('Guild not found');
    }

    // Get member with error handling
    const member = await guild.members.fetch({ user: userId, force: true }).catch(error => {
      console.error('Error fetching member:', error);
      throw new Error('Failed to fetch member data');
    });

    // Get roles with proper filtering and sorting
    const roles = member.roles.cache
      .filter(role => role.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(role => role.name)
      .join('\n');

    // Get timer data with error handling
    const [timerData, timeUntilNext] = await Promise.all([
      startOrUpdateDailyTimer(userId, aggregatedData.nftCounts, aggregatedData.buxBalance)
        .catch(error => {
          console.error('Error getting timer data:', error);
          return { claimAmount: 0 };
        }),
      getTimeUntilNextClaim(userId)
        .catch(error => {
          console.error('Error getting claim time:', error);
          return 'Error getting time';
        })
    ]);

    // Calculate daily reward
    const dailyReward = calculateDailyReward(aggregatedData.nftCounts);

    // Create embed
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`${user.username}'s BUX DAO Profile`)
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
          name: 'Server Roles',
          value: roles || 'No roles'
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

    // Create claim button
    const claimButton = new ButtonBuilder()
      .setCustomId('claim_bux')
      .setLabel('CLAIM')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true);

    const row = new ActionRowBuilder()
      .addComponents(claimButton);

    // Send message with error handling
    await channel.send({ 
      embeds: [embed],
      components: [row]
    }).catch(error => {
      console.error('Error sending profile message:', error);
      throw new Error('Failed to send profile message');
    });

    // Update roles in background
    updateDiscordRoles(userId, client).catch(error => {
      console.error('Error updating roles:', error);
    });

  } catch (error) {
    console.error('Error updating user profile:', error);
    await channel.send('An error occurred while processing your command. Please try again later.')
      .catch(sendError => console.error('Error sending error message:', sendError));
  }
}

function formatNFTCounts(nftCounts) {
  return Object.entries(nftCounts)
    .map(([collection, nfts]) => `${collection}: ${nfts.length}`)
    .join('\n');
}

function calculateDailyReward(nftCounts) {
  let reward = 0;
  
  // Updated reward multipliers
  reward += nftCounts.fcked_catz.length * 2;      // 2 BUX per FCatz
  reward += nftCounts.celebcatz.length * 8;       // 8 BUX per CelebCatz
  reward += nftCounts.money_monsters.length * 2;   // 2 BUX per MM
  reward += nftCounts.money_monsters3d.length * 4; // 4 BUX per MM3D
  reward += nftCounts.ai_bitbots.length * 1;      // 1 BUX per AI Bitbot

  return reward;
}

// Add missing exports
export {
  aggregateWalletData,
  formatNFTCounts,
  calculateDailyReward,
  updateUserProfile,
  getWalletData,
  addWallet,
  removeWallet
};
