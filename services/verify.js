import { connection } from '../config/solana.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { redis } from '../config/redis.js';
import { config } from '../config/config.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize hashlists object that we'll update
let hashlists = {
  fckedCatz: new Set(),
  celebCatz: new Set(),
  moneyMonsters: new Set(),
  moneyMonsters3d: new Set(),
  aiBitbots: new Set(),
  warriors: new Set(),
  squirrels: new Set(),
  rjctdBots: new Set(),
  energyApes: new Set(),
  doodleBots: new Set(),
  candyBots: new Set(),
  mmTop10: new Set(),
  mm3dTop10: new Set()
};

// Export all functions and hashlists
export {
  verifyHolder,
  verifyWallet,
  updateDiscordRoles,
  updateHashlists,
  getBUXBalance,
  hashlists
};

// Function implementations
async function verifyHolder(data, userId, client) {
  try {
    const { walletAddress } = data;
    console.log('Verifying holder:', { userId, walletAddress });

    // Store wallet address in Redis
    await redis.sadd(`wallets:${userId}`, walletAddress);

    // Get and store BUX balance in Redis
    const buxBalance = await getBUXBalance(walletAddress);
    await redis.set(`bux:${walletAddress}`, buxBalance.toString());
    
    // Get token accounts for wallet - single RPC call
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(walletAddress),
      { programId: TOKEN_PROGRAM_ID }
    );

    // Initialize NFT collections
    const nftCollections = {
      fcked_catz: [],
      celebcatz: [],
      money_monsters: [],
      money_monsters3d: [],
      ai_bitbots: [],
      warriors: [],
      squirrels: [],
      rjctd_bots: [],
      energy_apes: [],
      doodle_bots: [],
      candy_bots: []
    };

    // Process token accounts
    for (const acc of tokenAccounts.value) {
      const mint = acc.account.data.parsed.info.mint;
      const amount = parseInt(acc.account.data.parsed.info.tokenAmount.amount);
      
      if (amount > 0) {
        if (hashlists.fckedCatz?.has(mint)) nftCollections.fcked_catz.push(mint);
        if (hashlists.celebCatz?.has(mint)) nftCollections.celebcatz.push(mint);
        if (hashlists.moneyMonsters?.has(mint)) nftCollections.money_monsters.push(mint);
        if (hashlists.moneyMonsters3d?.has(mint)) nftCollections.money_monsters3d.push(mint);
        if (hashlists.aiBitbots?.has(mint)) nftCollections.ai_bitbots.push(mint);
        if (hashlists.warriors?.has(mint)) nftCollections.warriors.push(mint);
        if (hashlists.squirrels?.has(mint)) nftCollections.squirrels.push(mint);
        if (hashlists.rjctdBots?.has(mint)) nftCollections.rjctd_bots.push(mint);
        if (hashlists.energyApes?.has(mint)) nftCollections.energy_apes.push(mint);
        if (hashlists.doodleBots?.has(mint)) nftCollections.doodle_bots.push(mint);
        if (hashlists.candyBots?.has(mint)) nftCollections.candy_bots.push(mint);
      }
    }

    // Log NFT data before storing
    console.log('Storing NFT data for wallet:', walletAddress, nftCollections);

    // Store NFT data in Redis
    for (const [collection, mints] of Object.entries(nftCollections)) {
      if (mints.length > 0) {
        await redis.sadd(`nfts:${walletAddress}:${collection}`, ...mints);
      }
    }

    // Log stored data
    console.log('Stored data in Redis:', {
      walletAddress,
      nftCounts: Object.fromEntries(
        Object.entries(nftCollections).map(([k, v]) => [k, v.length])
      ),
      buxBalance
    });

    // Update Discord roles
    await updateDiscordRoles(userId, client);

    return {
      success: true,
      nftCounts: nftCollections,
      message: 'Verification successful'
    };

  } catch (error) {
    console.error('Error verifying holder:', error);
    throw error;
  }
}

// Add caching and rate limiting
const CACHE_TTL = 60 * 5; // 5 minutes
const RPC_DELAY = 100; // 100ms between RPC calls

// Add rate limiting queue
class RPCQueue {
  constructor(delay = 1000) {
    this.queue = [];
    this.delay = delay;
    this.processing = false;
  }

  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      if (!this.processing) {
        this.process();
      }
    });
  }

  async process() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const { fn, resolve, reject } = this.queue.shift();

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    }

    await new Promise(resolve => setTimeout(resolve, this.delay));
    this.process();
  }
}

const rpcQueue = new RPCQueue(1000); // 1 second between RPC calls

// Update verifyWallet to use queue
async function verifyWallet(userId, walletAddress) {
  try {
    console.log('Verifying wallet:', { userId, walletAddress });

    // Check cache first
    const cacheKey = `verify:${walletAddress}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log('Using cached verification result');
      return JSON.parse(cached);
    }

    // Queue RPC calls
    const tokenAccounts = await rpcQueue.add(() => 
      connection.getParsedTokenAccountsByOwner(
        new PublicKey(walletAddress),
        { programId: TOKEN_PROGRAM_ID }
      )
    );

    // Process token accounts
    const nftCounts = {
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

    // Check each token account against hashlists
    for (const acc of tokenAccounts.value) {
      const mint = acc.account.data.parsed.info.mint;
      const amount = parseInt(acc.account.data.parsed.info.tokenAmount.amount);
      
      if (amount > 0) {
        if (hashlists.fckedCatz.has(mint)) nftCounts.fcked_catz++;
        if (hashlists.celebCatz.has(mint)) nftCounts.celebcatz++;
        if (hashlists.moneyMonsters.has(mint)) nftCounts.money_monsters++;
        if (hashlists.moneyMonsters3d.has(mint)) nftCounts.money_monsters3d++;
        if (hashlists.aiBitbots.has(mint)) nftCounts.ai_bitbots++;
        if (hashlists.warriors.has(mint)) nftCounts.warriors++;
        if (hashlists.squirrels.has(mint)) nftCounts.squirrels++;
        if (hashlists.rjctdBots.has(mint)) nftCounts.rjctd_bots++;
        if (hashlists.energyApes.has(mint)) nftCounts.energy_apes++;
        if (hashlists.doodleBots.has(mint)) nftCounts.doodle_bots++;
        if (hashlists.candyBots.has(mint)) nftCounts.candy_bots++;
      }
    }

    // Store wallet in Redis
    await redis.sadd(`wallets:${userId}`, walletAddress);

    // Queue BUX balance check
    const buxBalance = await rpcQueue.add(() => getBUXBalance(walletAddress));

    // Calculate daily reward
    const dailyReward = calculateDailyReward(nftCounts);

    const result = {
      userId,
      walletAddress,
      nftCounts,
      buxBalance,
      dailyReward,
      success: true
    };

    // Cache the result
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));

    console.log('Verification results:', result);
    return result;

  } catch (error) {
    console.error('Error verifying wallet:', error);
    throw error;
  }
}

// Helper function to calculate daily reward
function calculateDailyReward(nftCounts) {
  let reward = 0;
  
  // Base rewards per NFT type - NO BONUSES
  const REWARDS = {
    fcked_catz: 5,       // 5 BUX per Fcked Cat
    celebcatz: 15,       // 15 BUX per Celeb Cat
    money_monsters: 5,    // 5 BUX per Money Monster
    money_monsters3d: 10, // 10 BUX per 3D Money Monster
    ai_bitbots: 3,       // 3 BUX per AI Bitbot
    
    // AI collabs all give 1 BUX each
    warriors: 1,
    squirrels: 1,
    rjctd_bots: 1,
    energy_apes: 1,
    doodle_bots: 1,
    candy_bots: 1
  };

  // Calculate base rewards for each collection
  for (const [collection, amount] of Object.entries(nftCounts)) {
    if (amount > 0) {
      reward += amount * REWARDS[collection];
    }
  }

  console.log('Daily reward calculation:', {
    nftCounts,
    totalReward: reward
  });

  return reward;
}

async function updateDiscordRoles(userId, client) {
  try {
    const guildId = process.env.GUILD_ID;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) throw new Error('Guild not found');

    const member = await guild.members.fetch(userId);
    if (!member) throw new Error('Member not found');

    // Get wallet data
    const wallets = await redis.smembers(`wallets:${userId}`);
    if (!wallets || wallets.length === 0) {
      console.log('No wallets found for user:', userId);
      return { nftCounts: {} };
    }

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

    // Process each wallet
    for (const wallet of wallets) {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        new PublicKey(wallet),
        { programId: TOKEN_PROGRAM_ID }
      );

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

    // Get current roles
    const currentRoles = new Set(member.roles.cache.map(role => role.id));
    const newRoles = new Set(currentRoles);

    // Add roles based on NFT holdings
    // Main collections
    if (nftCounts.fcked_catz.size > 0) newRoles.add(process.env.ROLE_ID_FCKED_CATZ);
    if (nftCounts.celebcatz.size > 0) newRoles.add(process.env.ROLE_ID_CELEBCATZ);
    if (nftCounts.money_monsters.size > 0) newRoles.add(process.env.ROLE_ID_MONEY_MONSTERS);
    if (nftCounts.money_monsters3d.size > 0) newRoles.add(process.env.ROLE_ID_MONEY_MONSTERS3D);
    if (nftCounts.ai_bitbots.size > 0) newRoles.add(process.env.ROLE_ID_AI_BITBOTS);

    // AI Collabs - make sure to add all roles
    if (nftCounts.warriors.size > 0) newRoles.add(process.env.ROLE_ID_WARRIORS);
    if (nftCounts.squirrels.size > 0) newRoles.add(process.env.ROLE_ID_SQUIRRELS);
    if (nftCounts.rjctd_bots.size > 0) newRoles.add(process.env.ROLE_ID_RJCTD_BOTS);
    if (nftCounts.energy_apes.size > 0) newRoles.add(process.env.ROLE_ID_ENERGY_APES);
    if (nftCounts.doodle_bots.size > 0) newRoles.add(process.env.ROLE_ID_DOODLE_BOTS);
    if (nftCounts.candy_bots.size > 0) newRoles.add(process.env.ROLE_ID_CANDY_BOTS);

    // Log role changes
    console.log('Role update for user:', userId, {
      currentRoles: Array.from(currentRoles),
      newRoles: Array.from(newRoles),
      nftCounts: {
        fcked_catz: nftCounts.fcked_catz.size,
        celebcatz: nftCounts.celebcatz.size,
        money_monsters: nftCounts.money_monsters.size,
        money_monsters3d: nftCounts.money_monsters3d.size,
        ai_bitbots: nftCounts.ai_bitbots.size,
        warriors: nftCounts.warriors.size,
        squirrels: nftCounts.squirrels.size,
        rjctd_bots: nftCounts.rjctd_bots.size,
        energy_apes: nftCounts.energy_apes.size,
        doodle_bots: nftCounts.doodle_bots.size,
        candy_bots: nftCounts.candy_bots.size
      }
    });

    // Update roles if they've changed
    if (!setsAreEqual(currentRoles, newRoles)) {
      await member.roles.set(Array.from(newRoles));
      console.log('Updated roles for user:', userId, {
        added: [...newRoles].filter(r => !currentRoles.has(r)),
        removed: [...currentRoles].filter(r => !newRoles.has(r))
      });
    } else {
      console.log('No role updates needed for user:', userId);
    }

    // Always return the nftCounts
    return {
      nftCounts: {
        fcked_catz: nftCounts.fcked_catz.size,
        celebcatz: nftCounts.celebcatz.size,
        money_monsters: nftCounts.money_monsters.size,
        money_monsters3d: nftCounts.money_monsters3d.size,
        ai_bitbots: nftCounts.ai_bitbots.size,
        warriors: nftCounts.warriors.size,
        squirrels: nftCounts.squirrels.size,
        rjctd_bots: nftCounts.rjctd_bots.size,
        energy_apes: nftCounts.energy_apes.size,
        doodle_bots: nftCounts.doodle_bots.size,
        candy_bots: nftCounts.candy_bots.size
      }
    };

  } catch (error) {
    console.error('Error updating Discord roles:', error);
    throw error;
  }
}

async function updateHashlists(newHashlists) {
  hashlists = newHashlists;
  console.log('Updated hashlists:', {
    fckedCatz: hashlists.fckedCatz.size,
    celebCatz: hashlists.celebCatz.size,
    moneyMonsters: hashlists.moneyMonsters.size,
    moneyMonsters3d: hashlists.moneyMonsters3d.size,
    aiBitbots: hashlists.aiBitbots.size,
    warriors: hashlists.warriors.size,
    squirrels: hashlists.squirrels.size,
    rjctdBots: hashlists.rjctdBots.size,
    energyApes: hashlists.energyApes.size,
    doodleBots: hashlists.doodleBots.size,
    candyBots: hashlists.candyBots.size,
    mmTop10: hashlists.mmTop10.size,
    mm3dTop10: hashlists.mm3dTop10.size
  });
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff(fn, maxRetries = 5) {
    let retries = 0;
    while (true) {
        try {
            return await fn();
        } catch (error) {
            if (!error.message.includes('429 Too Many Requests') || retries >= maxRetries) {
                throw error;
            }
            retries++;
            const delay = Math.min(1000 * Math.pow(2, retries), 10000);
            console.log(`Rate limited, retrying in ${delay}ms...`);
            await sleep(delay);
        }
    }
}

export async function getBUXBalance(walletAddress) {
  try {
    console.log('Getting BUX balance for wallet:', walletAddress);
    console.log('Using BUX token mint:', BUX_TOKEN_MINT);

    const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
    const tokenAccounts = await retryWithBackoff(() => 
      connection.getParsedTokenAccountsByOwner(
        new PublicKey(walletAddress),
        { mint: new PublicKey(BUX_TOKEN_MINT) }
      )
    );

    console.log('Found token accounts:', tokenAccounts.value.length);
    let totalBalance = 0;
    for (const account of tokenAccounts.value) {
      console.log('Checking token mint:', account.account.data.parsed.info.mint);
      if (account.account.data.parsed.info.mint === BUX_TOKEN_MINT) {
        const amount = account.account.data.parsed.info.tokenAmount.amount;
        console.log('Found BUX token with amount:', amount);
        totalBalance += parseInt(amount);
      }
    }

    console.log('Final BUX balance:', totalBalance);
    return totalBalance;
  } catch (error) {
    console.error('Error getting BUX balance:', error);
    return 0;
  }
}

// Check NFT ownership against hashlists
export async function checkNFTOwnership(walletAddress) {
  try {
    // Get token accounts for wallet - single RPC call
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(walletAddress),
      { programId: TOKEN_PROGRAM_ID }
    );

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

    console.log('NFT counts for wallet:', {
      walletAddress,
      totalMints: walletMints.size,
      counts: {
        fcked_catz: nftCounts.fcked_catz.size,
        celebcatz: nftCounts.celebcatz.size,
        money_monsters: nftCounts.money_monsters.size,
        money_monsters3d: nftCounts.money_monsters3d.size,
        ai_bitbots: nftCounts.ai_bitbots.size,
        warriors: nftCounts.warriors.size,
        squirrels: nftCounts.squirrels.size,
        rjctd_bots: nftCounts.rjctd_bots.size,
        energy_apes: nftCounts.energy_apes.size,
        doodle_bots: nftCounts.doodle_bots.size,
        candy_bots: nftCounts.candy_bots.size
      }
    });

    // Convert Sets to Arrays for response
    return {
      fcked_catz: Array.from(nftCounts.fcked_catz),
      celebcatz: Array.from(nftCounts.celebcatz),
      money_monsters: Array.from(nftCounts.money_monsters),
      money_monsters3d: Array.from(nftCounts.money_monsters3d),
      ai_bitbots: Array.from(nftCounts.ai_bitbots),
      warriors: Array.from(nftCounts.warriors),
      squirrels: Array.from(nftCounts.squirrels),
      rjctd_bots: Array.from(nftCounts.rjctd_bots),
      energy_apes: Array.from(nftCounts.energy_apes),
      doodle_bots: Array.from(nftCounts.doodle_bots),
      candy_bots: Array.from(nftCounts.candy_bots)
    };

  } catch (error) {
    console.error('Error checking NFT ownership:', error);
    throw error;
  }
}

// Update ROLES object to use the exact role IDs from .env
const ROLES = {
  // Main collections
  FCKED_CATZ: process.env.ROLE_ID_FCKED_CATZ,
  CELEBCATZ: process.env.ROLE_ID_CELEBCATZ,
  MONEY_MONSTERS: process.env.ROLE_ID_MONEY_MONSTERS,
  MONEY_MONSTERS_3D: process.env.ROLE_ID_MONEY_MONSTERS3D,
  AI_BITBOTS: process.env.ROLE_ID_AI_BITBOTS,
  
  // Top holders
  MM_TOP_10: process.env.ROLE_ID_MM_TOP10,
  MM3D_TOP_10: process.env.ROLE_ID_MM3D_TOP10,
  
  // AI Collabs with exact role IDs from .env
  WARRIORS: process.env.ROLE_ID_WARRIORS,      // 1300968343783735296
  SQUIRRELS: process.env.ROLE_ID_SQUIRRELS,    // 1300968613179686943
  ENERGY_APES: process.env.ROLE_ID_ENERGY_APES, // 1300968964276621313
  CANDY_BOTS: process.env.ROLE_ID_CANDY_BOTS,  // 1300969268665389157
  RJCTD_BOTS: process.env.ROLE_ID_RJCTD_BOTS,  // 1300969147441610773
  DOODLE_BOTS: process.env.ROLE_ID_DOODLE_BOTS // 1300969353952362557
};

// Helper function to compare sets
function setsAreEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

// Add assignRoles function and export it
export async function assignRoles(nftCounts, discordId, accessToken) {
  try {
    const guildId = config.discord.guildId;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

    // Get current member roles
    const memberResponse = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`,
      { headers }
    );

    if (!memberResponse.ok) {
      throw new Error(`Failed to get member data: ${await memberResponse.text()}`);
    }

    const memberData = await memberResponse.json();
    const currentRoles = new Set(memberData.roles);
    const newRoles = new Set(currentRoles);

    // Check each collection and assign roles
    if (nftCounts.fcked_catz.length > 0) newRoles.add(ROLES.FCKED_CATZ);
    if (nftCounts.celebcatz.length > 0) newRoles.add(ROLES.CELEBCATZ);
    if (nftCounts.money_monsters.length > 0) newRoles.add(ROLES.MONEY_MONSTERS);
    if (nftCounts.money_monsters3d.length > 0) newRoles.add(ROLES.MONEY_MONSTERS_3D);
    if (nftCounts.ai_bitbots.length > 0) newRoles.add(ROLES.AI_BITBOTS);
    if (nftCounts.mm_top10.length > 0) newRoles.add(ROLES.MM_TOP_10);
    if (nftCounts.mm3d_top10.length > 0) newRoles.add(ROLES.MM3D_TOP_10);
    if (nftCounts.warriors.length > 0) newRoles.add(ROLES.WARRIORS);
    if (nftCounts.squirrels.length > 0) newRoles.add(ROLES.SQUIRRELS);
    if (nftCounts.rjctd_bots.length > 0) newRoles.add(ROLES.RJCTD_BOTS);
    if (nftCounts.energy_apes.length > 0) newRoles.add(ROLES.ENERGY_APES);
    if (nftCounts.doodle_bots.length > 0) newRoles.add(ROLES.DOODLE_BOTS);
    if (nftCounts.candy_bots.length > 0) newRoles.add(ROLES.CANDY_BOTS);

    // Update roles if they've changed
    if (!setsAreEqual(currentRoles, newRoles)) {
      const response = await fetch(
        `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            roles: Array.from(newRoles)
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update roles: ${await response.text()}`);
      }

      console.log('Roles updated successfully for user:', discordId);
      return true;
    }

    console.log('No role updates needed for user:', discordId);
    return false;
  } catch (error) {
    console.error('Error assigning roles:', error);
    throw error;
  }
}
