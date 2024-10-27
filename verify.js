import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
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

// Load hashlists
const loadHashlist = async (filename) => {
  const filePath = path.join(process.cwd(), 'hashlists', filename);
  const data = await fs.readFile(filePath, 'utf8');
  return new Set(JSON.parse(data));
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

export async function updateDiscordRoles(client, userId, nftCounts, buxBalance) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const member = await guild.members.fetch(userId);

    const allRoles = [
      process.env.ROLE_ID_FCKED_CATZ,
      process.env.WHALE_ROLE_ID_FCKED_CATZ,
      process.env.ROLE_ID_CELEBCATZ,
      process.env.ROLE_ID_MONEY_MONSTERS,
      process.env.WHALE_ROLE_ID_MONEY_MONSTERS,
      process.env.ROLE_ID_MONEY_MONSTERS3D,
      process.env.ROLE_ID_MM_TOP10,
      process.env.ROLE_ID_MM3D_TOP10,
      process.env.WHALE_ROLE_ID_MONEY_MONSTERS3D,
      process.env.ROLE_ID_AI_BITBOTS,
      process.env.WHALE_ROLE_ID_AI_BITBOTS,
      process.env.ROLE_ID_50000_BUX,
      process.env.ROLE_ID_25000_BUX,
      process.env.ROLE_ID_10000_BUX,
      process.env.ROLE_ID_2500_BUX
    ];

    const rolesToAdd = [];
    const rolesToRemove = [...allRoles];

    // Add NFT roles and whale roles
    if (nftCounts.fcked_catz.length > 0) {
      rolesToAdd.push(process.env.ROLE_ID_FCKED_CATZ);
      rolesToRemove.splice(rolesToRemove.indexOf(process.env.ROLE_ID_FCKED_CATZ), 1);
      if (nftCounts.fcked_catz.length >= parseInt(process.env.WHALE_THRESHOLD_FCKED_CATZ)) {
        rolesToAdd.push(process.env.WHALE_ROLE_ID_FCKED_CATZ);
        rolesToRemove.splice(rolesToRemove.indexOf(process.env.WHALE_ROLE_ID_FCKED_CATZ), 1);
      }
    }
    if (nftCounts.celebcatz.length > 0) {
      rolesToAdd.push(process.env.ROLE_ID_CELEBCATZ);
      rolesToRemove.splice(rolesToRemove.indexOf(process.env.ROLE_ID_CELEBCATZ), 1);
    }
    if (nftCounts.money_monsters.length > 0) {
      rolesToAdd.push(process.env.ROLE_ID_MONEY_MONSTERS);
      rolesToRemove.splice(rolesToRemove.indexOf(process.env.ROLE_ID_MONEY_MONSTERS), 1);
      if (nftCounts.money_monsters.length >= parseInt(process.env.WHALE_THRESHOLD_MONEY_MONSTERS)) {
        rolesToAdd.push(process.env.WHALE_ROLE_ID_MONEY_MONSTERS);
        rolesToRemove.splice(rolesToRemove.indexOf(process.env.WHALE_ROLE_ID_MONEY_MONSTERS), 1);
      }
    }
    if (nftCounts.money_monsters3d.length > 0) {
      rolesToAdd.push(process.env.ROLE_ID_MONEY_MONSTERS3D);
      rolesToRemove.splice(rolesToRemove.indexOf(process.env.ROLE_ID_MONEY_MONSTERS3D), 1);
      
      const whaleThreshold = parseInt(process.env.WHALE_THRESHOLD_MONEY_MONSTERS3D);
      console.log(`Money Monsters 3D count: ${nftCounts.money_monsters3d.length}, Whale threshold: ${whaleThreshold}`);
      
      if (nftCounts.money_monsters3d.length >= whaleThreshold) {
        rolesToAdd.push(process.env.WHALE_ROLE_ID_MONEY_MONSTERS3D);
        rolesToRemove.splice(rolesToRemove.indexOf(process.env.WHALE_ROLE_ID_MONEY_MONSTERS3D), 1);
        console.log(`Adding Money Monsters 3D Whale role. NFT count: ${nftCounts.money_monsters3d.length}`);
      } else {
        rolesToRemove.push(process.env.ROLE_ID_MONEY_MONSTERS3D);
        rolesToRemove.push(process.env.WHALE_ROLE_ID_MONEY_MONSTERS3D);
      }
    } else {
      rolesToRemove.push(process.env.ROLE_ID_MONEY_MONSTERS3D);
      rolesToRemove.push(process.env.WHALE_ROLE_ID_MONEY_MONSTERS3D);
    }
    if (nftCounts.ai_bitbots.length > 0) {
      rolesToAdd.push(process.env.ROLE_ID_AI_BITBOTS);
      rolesToRemove.splice(rolesToRemove.indexOf(process.env.ROLE_ID_AI_BITBOTS), 1);
      if (nftCounts.ai_bitbots.length >= parseInt(process.env.WHALE_THRESHOLD_AI_BITBOTS)) {
        rolesToAdd.push(process.env.WHALE_ROLE_ID_AI_BITBOTS);
        rolesToRemove.splice(rolesToRemove.indexOf(process.env.WHALE_ROLE_ID_AI_BITBOTS), 1);
      }
    }

    // Add BUX balance roles
    if (buxBalance >= 50000) {
      rolesToAdd.push(process.env.ROLE_ID_50000_BUX);
      rolesToRemove.splice(rolesToRemove.indexOf(process.env.ROLE_ID_50000_BUX), 1);
    } else if (buxBalance >= 25000) {
      rolesToAdd.push(process.env.ROLE_ID_25000_BUX);
      rolesToRemove.splice(rolesToRemove.indexOf(process.env.ROLE_ID_25000_BUX), 1);
    } else if (buxBalance >= 10000) {
      rolesToAdd.push(process.env.ROLE_ID_10000_BUX);
      rolesToRemove.splice(rolesToRemove.indexOf(process.env.ROLE_ID_10000_BUX), 1);
    } else if (buxBalance >= 2500) {
      rolesToAdd.push(process.env.ROLE_ID_2500_BUX);
      rolesToRemove.splice(rolesToRemove.indexOf(process.env.ROLE_ID_2500_BUX), 1);
    }

    // Handle Money Monsters Top 10
    if (nftCounts.money_monsters.some(nft => MM_TOP10_HASHLIST.has(nft))) {
      rolesToAdd.push(process.env.ROLE_ID_MM_TOP10);
      rolesToRemove.splice(rolesToRemove.indexOf(process.env.ROLE_ID_MM_TOP10), 1);
      console.log(`Adding Money Monsters Top 10 role for user ${userId}`);
    } else {
      rolesToRemove.push(process.env.ROLE_ID_MM_TOP10);
      console.log(`Removing Money Monsters Top 10 role for user ${userId}`);
    }

    // Handle Money Monsters 3D Top 10
    if (nftCounts.money_monsters3d.some(nft => MM3D_TOP10_HASHLIST.has(nft))) {
      rolesToAdd.push(process.env.ROLE_ID_MM3D_TOP10);
      rolesToRemove.splice(rolesToRemove.indexOf(process.env.ROLE_ID_MM3D_TOP10), 1);
      console.log(`Adding Money Monsters 3D Top 10 role for user ${userId}`);
    } else {
      rolesToRemove.push(process.env.ROLE_ID_MM3D_TOP10);
      console.log(`Removing Money Monsters 3D Top 10 role for user ${userId}`);
    }

    // Remove roles that are in rolesToRemove
    for (const roleId of rolesToRemove) {
      if (roleId && member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
        console.log(`Removed role ${roleId} from user ${userId}`);
      }
    }

    // Add the new roles
    for (const roleId of rolesToAdd) {
      if (roleId && !member.roles.cache.has(roleId)) {
        await member.roles.add(roleId);
        console.log(`Added role ${roleId} to user ${userId}`);
      }
    }

    console.log(`Updated roles for user ${userId}:`, { added: rolesToAdd, removed: rolesToRemove });
    return true;
  } catch (error) {
    console.error('Error updating Discord roles:', error);
    return false;
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
