import { EmbedBuilder } from 'discord.js';
import { updateDiscordRoles, checkNFTOwnership, getBUXBalance, hashlists } from './verify.js';
import { redis } from '../config/redis.js';
import { startOrUpdateDailyTimer, getTimeUntilNextClaim } from './rewards.js';
import { connection } from '../config/solana.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';

// Add caching for NFT data
const NFT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper functions
async function getCachedNFTData(walletAddress) {
  try {
    const cached = await redis.hgetall(`wallet:${walletAddress}:nfts`);
    if (cached && Object.keys(cached).length > 0) {
      return {
        fcked_catz: JSON.parse(cached.fcked_catz || '[]'),
        celebcatz: JSON.parse(cached.celebcatz || '[]'),
        money_monsters: JSON.parse(cached.money_monsters || '[]'),
        money_monsters3d: JSON.parse(cached.money_monsters3d || '[]'),
        ai_bitbots: JSON.parse(cached.ai_bitbots || '[]'),
        warriors: JSON.parse(cached.warriors || '[]')
      };
    }
    
    const data = await checkNFTOwnership(walletAddress);
    
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
}

async function getWalletData(userId) {
  try {
    const wallets = await redis.smembers(`wallets:${userId}`);
    console.log(`Retrieved wallets for user ${userId}:`, wallets);
    return { walletAddresses: wallets || [] };
  } catch (error) {
    console.error('Error getting wallet data:', error);
    return { walletAddresses: [] };
  }
}

async function addWallet(userId, walletAddress) {
  try {
    await redis.sadd(`wallets:${userId}`, walletAddress);
    return true;
  } catch (error) {
    console.error('Error adding wallet:', error);
    return false;
  }
}

async function removeWallet(userId, walletAddress) {
  try {
    await redis.srem(`wallets:${userId}`, walletAddress);
    return true;
  } catch (error) {
    console.error('Error removing wallet:', error);
    return false;
  }
}

async function updateUserProfile(channel, userId, client) {
  try {
    const walletData = await getWalletData(userId);
    if (!walletData || !walletData.walletAddresses.length === 0) {
      throw new Error('No wallets connected');
    }
    console.log(`Processing profile for user ${userId} with wallets:`, walletData.walletAddresses);

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

    for (const walletAddress of walletData.walletAddresses) {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        new PublicKey(walletAddress),
        { programId: TOKEN_PROGRAM_ID }
      );

      for (const acc of tokenAccounts.value) {
        if (acc.account.data.parsed.info.mint === process.env.BUX_TOKEN_MINT) {
          totalBuxBalance += parseInt(acc.account.data.parsed.info.tokenAmount.amount);
        }
      }

      const walletMints = new Set();
      for (const acc of tokenAccounts.value) {
        const mint = acc.account.data.parsed.info.mint;
        const amount = parseInt(acc.account.data.parsed.info.tokenAmount.amount);
        if (amount > 0) {
          walletMints.add(mint);
        }
      }

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

    // Update Discord roles before creating embed
    console.log('Updating roles for user:', userId);
    const rolesUpdated = await updateDiscordRoles(userId, client);
    if (rolesUpdated) {
      console.log('Roles were updated for user:', userId);
    } else {
      console.log('No role updates needed for user:', userId);
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

    const dailyReward = calculateDailyReward({
      fcked_catz: nftCounts.fcked_catz.size,
      celebcatz: nftCounts.celebcatz.size,
      money_monsters: nftCounts.money_monsters.size,
      money_monsters3d: nftCounts.money_monsters3d.size,
      ai_bitbots: nftCounts.ai_bitbots.size,
      warriors: nftCounts.warriors.size
    });

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
          value: Object.entries({
            'Fcked Catz': nftCounts.fcked_catz.size,
            'CelebCatz': nftCounts.celebcatz.size,
            'Money Monsters': nftCounts.money_monsters.size,
            'Money Monsters 3D': nftCounts.money_monsters3d.size,
            'AI Bitbots': nftCounts.ai_bitbots.size
          })
            .map(([collection, count]) => `${collection}: ${count}`)
            .join('\n') || 'No NFTs'
        },
        { name: '\u200B', value: '─'.repeat(40) },
        {
          name: 'A.I. Collabs',
          value: Object.entries({
            'A.I. Warriors': nftCounts.warriors.size,
            'A.I. Squirrels': nftCounts.squirrels.size,
            'A.I. Energy Apes': nftCounts.energy_apes.size,
            'RJCTD Bots': nftCounts.rjctd_bots.size,
            'Candy Bots': nftCounts.candy_bots.size,
            'Doodle Bots': nftCounts.doodle_bots.size
          })
            .map(([collection, count]) => `${collection}: ${count}`)
            .join('\n') || 'No A.I. Collab NFTs'
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

function calculateDailyReward(nftCounts) {
  try {
    let reward = 0;
    
    const counts = {
      fcked_catz: nftCounts.fcked_catz || 0,
      celebcatz: nftCounts.celebcatz || 0,
      money_monsters: nftCounts.money_monsters || 0,
      money_monsters3d: nftCounts.money_monsters3d || 0,
      ai_bitbots: nftCounts.ai_bitbots || 0,
      warriors: nftCounts.warriors || 0
    };
    
    reward += counts.fcked_catz * 2;      // 2 BUX per FCatz
    reward += counts.celebcatz * 8;       // 8 BUX per CelebCatz
    reward += counts.money_monsters * 2;   // 2 BUX per MM
    reward += counts.money_monsters3d * 4; // 4 BUX per MM3D
    reward += counts.ai_bitbots * 1;      // 1 BUX per AI Bitbot
    reward += counts.warriors * 2;         // 2 BUX per Warriors NFT

    return reward;
  } catch (error) {
    console.error('Error calculating daily reward:', error);
    return 0;
  }
}

async function aggregateWalletData(walletData) {
  try {
    const nftSets = {
      fcked_catz: new Set(),
      celebcatz: new Set(),
      money_monsters: new Set(),
      money_monsters3d: new Set(),
      ai_bitbots: new Set(),
      warriors: new Set()
    };
    let totalBuxBalance = 0;

    for (const walletAddress of walletData.walletAddresses) {
      const nftData = await checkNFTOwnership(walletAddress);
      
      Object.entries(nftData).forEach(([collection, nfts]) => {
        nfts.forEach(nft => nftSets[collection].add(nft));
      });

      const balance = await getBUXBalance(walletAddress);
      totalBuxBalance += balance;
    }

    const nftCounts = {
      fcked_catz: Array.from(nftSets.fcked_catz),
      celebcatz: Array.from(nftSets.celebcatz),
      money_monsters: Array.from(nftSets.money_monsters),
      money_monsters3d: Array.from(nftSets.money_monsters3d),
      ai_bitbots: Array.from(nftSets.ai_bitbots),
      warriors: Array.from(nftSets.warriors)
    };

    return {
      nftCounts,
      buxBalance: totalBuxBalance
    };
  } catch (error) {
    console.error('Error in aggregateWalletData:', error);
    throw error;
  }
}

function formatNFTCounts(nftCounts) {
  return Object.entries(nftCounts)
    .filter(([_, nfts]) => nfts.length > 0)
    .map(([collection, nfts]) => `${collection}: ${nfts.length}`)
    .join('\n') || 'No NFTs found';
}

// Export all functions
export {
  getWalletData,
  addWallet,
  removeWallet,
  updateUserProfile,
  formatNFTCounts,
  aggregateWalletData,
  getCachedNFTData
};
