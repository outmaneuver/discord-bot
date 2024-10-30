import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import { updateDiscordRoles, checkNFTOwnership, getBUXBalance } from './verify.js';
import { redis } from '../config/redis.js';
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
        ai_bitbots: JSON.parse(cached.ai_bitbots || '[]'),
        warriors: JSON.parse(cached.warriors || '[]')
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
      ai_bitbots: JSON.stringify(data.ai_bitbots),
      warriors: JSON.stringify(data.warriors)
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
    if (!walletData || !walletData.walletAddresses.length === 0) {
      throw new Error('No wallets connected');
    }
    console.log(`Processing profile for user ${userId} with wallets:`, walletData.walletAddresses);

    // Initialize NFT counts with empty Sets
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

    // Process each wallet
    for (const walletAddress of walletData.walletAddresses) {
      // Get token accounts for wallet - single RPC call
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        new PublicKey(walletAddress),
        { programId: TOKEN_PROGRAM_ID }
      );

      // Get BUX balance
      for (const acc of tokenAccounts.value) {
        if (acc.account.data.parsed.info.mint === process.env.BUX_TOKEN_MINT) {
          totalBuxBalance += parseInt(acc.account.data.parsed.info.tokenAmount.amount);
        }
      }

      // Get all token mints from wallet
      const walletMints = new Set();
      for (const acc of tokenAccounts.value) {
        const mint = acc.account.data.parsed.info.mint;
        const amount = parseInt(acc.account.data.parsed.info.tokenAmount.amount);
        if (amount > 0) {
          walletMints.add(mint);
        }
      }

      // Check mints against hashlists - no RPC calls
      for (const mint of walletMints) {
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
      }
    }

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

    // Calculate daily reward
    const dailyReward = calculateDailyReward({
      fcked_catz: nftCounts.fcked_catz.size,
      celebcatz: nftCounts.celebcatz.size,
      money_monsters: nftCounts.money_monsters.size,
      money_monsters3d: nftCounts.money_monsters3d.size,
      ai_bitbots: nftCounts.ai_bitbots.size,
      warriors: nftCounts.warriors.size
    });

    // Get timer data
    const [timerData, timeUntilNext] = await Promise.all([
      startOrUpdateDailyTimer(userId, {
        fcked_catz: nftCounts.fcked_catz.size,
        celebcatz: nftCounts.celebcatz.size,
        money_monsters: nftCounts.money_monsters.size,
        money_monsters3d: nftCounts.money_monsters3d.size,
        ai_bitbots: nftCounts.ai_bitbots.size,
        warriors: nftCounts.warriors.size
      }, totalBuxBalance),
      getTimeUntilNextClaim(userId)
    ]);

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
          value: Object.entries({
            'Fcked Catz': nftCounts.fcked_catz.size,
            'CelebCatz': nftCounts.celebcatz.size,
            'Money Monsters': nftCounts.money_monsters.size,
            'Money Monsters 3D': nftCounts.money_monsters3d.size,
            'AI Bitbots': nftCounts.ai_bitbots.size,
            'Warriors': nftCounts.warriors.size,
            'Squirrels': nftCounts.squirrels.size,
            'RJCTD Bots': nftCounts.rjctd_bots.size,
            'Energy Apes': nftCounts.energy_apes.size,
            'Doodle Bots': nftCounts.doodle_bots.size,
            'Candy Bots': nftCounts.candy_bots.size
          })
            .filter(([_, count]) => count > 0)
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

// Fix calculateDailyReward function
function calculateDailyReward(nftCounts) {
  try {
    let reward = 0;
    
    // Make sure we're working with numbers
    const counts = {
      fcked_catz: parseInt(nftCounts.fcked_catz) || 0,
      celebcatz: parseInt(nftCounts.celebcatz) || 0,
      money_monsters: parseInt(nftCounts.money_monsters) || 0,
      money_monsters3d: parseInt(nftCounts.money_monsters3d) || 0,
      ai_bitbots: parseInt(nftCounts.ai_bitbots) || 0,
      warriors: parseInt(nftCounts.warriors) || 0
    };
    
    // Calculate rewards
    reward += counts.fcked_catz * 2;      // 2 BUX per FCatz
    reward += counts.celebcatz * 8;       // 8 BUX per CelebCatz
    reward += counts.money_monsters * 2;   // 2 BUX per MM
    reward += counts.money_monsters3d * 4; // 4 BUX per MM3D
    reward += counts.ai_bitbots * 1;      // 1 BUX per AI Bitbot
    reward += counts.warriors * 2;      // 2 BUX per Warriors NFT

    console.log('Daily reward calculation:', {
      counts,
      reward,
      timestamp: new Date().toISOString()
    });

    return reward;
  } catch (error) {
    console.error('Error calculating daily reward:', error);
    return 0;
  }
}

// Fix my.nfts command handler in aggregateWalletData
export async function aggregateWalletData(walletData) {
  try {
    // Initialize with Sets to prevent duplicates
    const nftSets = {
      fcked_catz: new Set(),
      celebcatz: new Set(),
      money_monsters: new Set(),
      money_monsters3d: new Set(),
      ai_bitbots: new Set(),
      warriors: new Set()
    };
    let totalBuxBalance = 0;

    // Get NFTs from all wallets
    for (const walletAddress of walletData.walletAddresses) {
      const nftData = await checkNFTOwnership(walletAddress);
      
      // Add NFTs to Sets
      Object.entries(nftData).forEach(([collection, nfts]) => {
        nfts.forEach(nft => nftSets[collection].add(nft));
      });

      // Get BUX balance
      const balance = await getBUXBalance(walletAddress);
      totalBuxBalance += balance;
    }

    // Convert Sets to arrays
    const nftCounts = {
      fcked_catz: Array.from(nftSets.fcked_catz),
      celebcatz: Array.from(nftSets.celebcatz),
      money_monsters: Array.from(nftSets.money_monsters),
      money_monsters3d: Array.from(nftSets.money_monsters3d),
      ai_bitbots: Array.from(nftSets.ai_bitbots),
      warriors: Array.from(nftSets.warriors)
    };

    console.log('Aggregated NFT counts:', {
      fcked_catz: nftCounts.fcked_catz.length,
      celebcatz: nftCounts.celebcatz.length,
      money_monsters: nftCounts.money_monsters.length,
      money_monsters3d: nftCounts.money_monsters3d.length,
      ai_bitbots: nftCounts.ai_bitbots.length,
      warriors: nftCounts.warriors.length,
      timestamp: new Date().toISOString()
    });

    return {
      nftCounts,
      buxBalance: totalBuxBalance
    };
  } catch (error) {
    console.error('Error in aggregateWalletData:', error);
    throw error;
  }
}
