import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionsBitField } from 'discord.js';
import Redis from 'ioredis';
import fs from 'fs/promises';
import path from 'path';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  }
});

const connection = new Connection(process.env.SOLANA_RPC_URL);
const BUX_TOKEN_MINT = process.env.BUX_TOKEN_MINT;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

// Load hashlists
const loadHashlist = async (filename) => {
  const filePath = path.join(process.cwd(), 'hashlists', filename);
  const data = await fs.readFile(filePath, 'utf8');
  return JSON.parse(data);
};

let fckedCatzHashlist, celebcatzHashlist, moneyMonstersHashlist, moneyMonsters3dHashlist, aiBitbotsHashlist, MM_TOP10_HASHLIST, MM3D_TOP10_HASHLIST;

const initializeHashlists = async () => {
  fckedCatzHashlist = await loadHashlist('fcked_catz.json');
  celebcatzHashlist = await loadHashlist('celebcatz.json');
  moneyMonstersHashlist = await loadHashlist('money_monsters.json');
  moneyMonsters3dHashlist = await loadHashlist('money_monsters3d.json');
  aiBitbotsHashlist = await loadHashlist('ai_bitbots.json');
  MM_TOP10_HASHLIST = await loadHashlist('MM_top10.json');
  MM3D_TOP10_HASHLIST = await loadHashlist('MM3D_top10.json');
};

// Call this function when your bot starts up
initializeHashlists();

export async function verifyHolder(message) {
  try {
    console.log(`Verifying wallet: ${message.walletAddress}`);
    const nftCounts = await checkNFTOwnership(message.walletAddress);
    console.log('NFT ownership check complete:', nftCounts);

    const buxBalance = await getBUXBalance(message.walletAddress);
    console.log('BUX balance:', buxBalance);

    const rolesUpdated = await updateDiscordRoles(message.client, message.userId, nftCounts, buxBalance);

    // Calculate daily reward
    const dailyReward = calculateDailyReward(nftCounts, buxBalance);

    const formattedResponse = `**VERIFIED ASSETS:**\nFcked Catz - ${nftCounts.fcked_catz.length}\nCeleb Catz - ${nftCounts.celebcatz.length}\nMoney Monsters - ${nftCounts.money_monsters.length}\nMoney Monsters 3D - ${nftCounts.money_monsters3d.length}\nA.I. BitBots - ${nftCounts.ai_bitbots.length}\n$BUX - ${buxBalance}\n\n**Daily reward = ${dailyReward} $BUX**`;

    return {
      success: true,
      rolesUpdated,
      nftCounts,
      buxBalance,
      dailyReward,
      formattedResponse
    };
  } catch (error) {
    console.error('Error in verifyHolder:', error);
    return { success: false, error: error.message };
  }
}

function calculateDailyReward(nftCounts, buxBalance) {
  // Implement your daily reward calculation logic here
  // This is just a placeholder
  return (nftCounts.fcked_catz.length * 2) + 
         (nftCounts.money_monsters.length * 2) + 
         (nftCounts.ai_bitbots.length * 1) + 
         (nftCounts.money_monsters3d.length * 4) + 
         (nftCounts.celebcatz.length * 8);
}

async function storeWalletAddress(userId, walletAddress) {
  const key = `wallets:${userId}`;
  await redis.sadd(key, walletAddress);
}

async function getAllWallets(userId) {
  const key = `wallets:${userId}`;
  return await redis.smembers(key);
}

export async function checkNFTOwnership(walletAddress) {
  console.log('Checking NFT ownership for wallet:', walletAddress);
  
  try {
    // Get all NFTs for the wallet
    const nfts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(walletAddress),
      {
        programId: TOKEN_PROGRAM_ID,
      }
    );

    console.log(`Found ${nfts.value.length} tokens for wallet ${walletAddress}`);

    // Initialize counts
    const nftCounts = {
      fcked_catz: [],
      celebcatz: [],
      money_monsters: [],
      money_monsters3d: [],
      ai_bitbots: []
    };

    // Check each NFT
    for (const item of nfts.value) {
      const mint = item.account.data.parsed.info.mint;
      
      // Check each collection
      if (fckedCatzHashlist.has(mint)) {
        nftCounts.fcked_catz.push(mint);
      }
      if (celebcatzHashlist.has(mint)) {
        nftCounts.celebcatz.push(mint);
      }
      if (moneyMonstersHashlist.has(mint)) {
        nftCounts.money_monsters.push(mint);
      }
      if (moneyMonsters3dHashlist.has(mint)) {
        nftCounts.money_monsters3d.push(mint);
      }
      if (aiBitbotsHashlist.has(mint)) {
        nftCounts.ai_bitbots.push(mint);
      }
    }

    console.log('NFT counts:', nftCounts);
    return nftCounts;

  } catch (error) {
    console.error('Error checking NFT ownership:', error);
    throw error;
  }
}

async function fetchBUXBalanceFromBlockchain(walletAddress) {
  try {
    const publicKey = new PublicKey(walletAddress);
    const buxMint = new PublicKey(BUX_TOKEN_MINT);

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
      mint: buxMint
    });

    if (tokenAccounts.value.length > 0) {
      const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
      console.log(`Fetched BUX balance for ${walletAddress}: ${balance}`);
      return balance;
    }

    console.log(`No BUX balance found for ${walletAddress}`);
    return 0;
  } catch (error) {
    console.error(`Error fetching BUX balance for ${walletAddress}:`, error);
    return 0;
  }
}

export async function getBUXBalance(walletAddress) {
  console.log(`Getting BUX balance for wallet: ${walletAddress}`);
  const balance = await fetchBUXBalanceFromBlockchain(walletAddress);
  return balance;
}

// Migrate old Redis keys to new format
async function migrateWalletData(userId) {
  try {
    const oldKey = `wallets:${userId}`;
    const newKey = `user:${userId}:wallets`;
    
    // Check if old data exists
    const oldData = await redis.get(oldKey);
    if (oldData) {
      const wallets = JSON.parse(oldData).walletAddresses;
      // Delete old key
      await redis.del(oldKey);
      // Add wallets to new set
      if (wallets && wallets.length > 0) {
        await redis.sadd(newKey, ...wallets);
      }
    }
  } catch (error) {
    console.error('Error migrating wallet data:', error);
  }
}

export async function updateDiscordRoles(userId, aggregatedData, client) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    if (!guild) {
      console.error('Guild not found');
      return;
    }

    const member = await guild.members.fetch(userId);
    if (!member) {
      console.error('Member not found');
      return;
    }

    console.log('Updating Discord roles based on all connected wallets');

    // Money Monsters 3D Whale Check
    const mm3dCount = aggregatedData.nftCounts.money_monsters3d.length;
    const mm3dWhaleThreshold = 25;
    console.log(`Money Monsters 3D count: ${mm3dCount}, Whale threshold: ${mm3dWhaleThreshold}`);

    // Money Monsters Whale Check
    const mmCount = aggregatedData.nftCounts.money_monsters.length;
    const mmWhaleThreshold = 25;

    // Remove Top 10 roles first
    await member.roles.remove('1095033759612547133').catch(console.error);
    await member.roles.remove('1095033566070583457').catch(console.error);

    // Update roles based on NFT counts
    const rolesToAdd = [];
    const rolesToRemove = [];

    // Add your role update logic here...
    if (aggregatedData.nftCounts.fcked_catz.length > 0) {
      rolesToAdd.push('1093607187454111825'); // CAT role
    } else {
      rolesToRemove.push('1093607187454111825');
    }

    // Add/remove roles
    for (const roleId of rolesToAdd) {
      await member.roles.add(roleId).catch(console.error);
    }

    for (const roleId of rolesToRemove) {
      await member.roles.remove(roleId).catch(console.error);
    }

    console.log('Updated roles for user', userId + ':', {
      added: rolesToAdd,
      removed: rolesToRemove
    });

  } catch (error) {
    console.error('Error updating Discord roles:', error);
    throw error;
  }
}

export function sendVerificationMessage(channel) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('THANK YOU FOR CHOOSING BUXDAO')
        .setDescription('To verify your wallet, click the link below and open it in your browser on desktop or copy and paste into wallet browser on mobile devices\n\nAuthorise signing into your discord profile then connect your wallet\n\nYour server roles will update automatically based on your NFT and $BUX token holdings')
        .setTimestamp();

    const button = new ButtonBuilder()
        .setLabel('Verify Wallet')
        .setStyle(ButtonStyle.Link)
        .setURL('https://buxdao-verify-d1faffc83da7.herokuapp.com/holder-verify/');

    const row = new ActionRowBuilder()
        .addComponents(button);

    return channel.send({ embeds: [embed], components: [row] });
}

// Add these functions to verify.js
async function startOrUpdateDailyTimer(userId) {
  const key = `daily_timer:${userId}`;
  const claimKey = `bux_claim:${userId}`;
  
  // Get last check time
  const lastCheck = await redis.get(key);
  const now = Date.now();
  
  if (!lastCheck) {
    // First time setup
    await redis.set(key, now);
    return {
      nextClaimTime: now + (24 * 60 * 60 * 1000),
      claimAmount: 0
    };
  }

  const timeDiff = now - parseInt(lastCheck);
  if (timeDiff >= 24 * 60 * 60 * 1000) {
    // 24 hours passed, add reward to claim balance
    const reward = await calculateDailyReward(userId);
    const currentClaim = parseInt(await redis.get(claimKey) || '0');
    await redis.set(claimKey, currentClaim + reward);
    await redis.set(key, now);
    
    return {
      nextClaimTime: now + (24 * 60 * 60 * 1000),
      claimAmount: currentClaim + reward
    };
  }

  return {
    nextClaimTime: parseInt(lastCheck) + (24 * 60 * 60 * 1000),
    claimAmount: parseInt(await redis.get(claimKey) || '0')
  };
}

async function getTimeUntilNextClaim(userId) {
  const key = `daily_timer:${userId}`;
  const lastCheck = await redis.get(key);
  
  if (!lastCheck) return null;

  const nextClaimTime = parseInt(lastCheck) + (24 * 60 * 60 * 1000);
  const timeLeft = nextClaimTime - Date.now();
  
  if (timeLeft <= 0) return '00:00:00';
  
  const hours = Math.floor(timeLeft / (60 * 60 * 1000));
  const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((timeLeft % (60 * 1000)) / 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
