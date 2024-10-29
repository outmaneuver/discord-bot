import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionsBitField } from 'discord.js';
import Redis from 'ioredis';
import fs from 'fs/promises';
import path from 'path';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { config } from '../config/config.js';

// Create a single Redis instance to be shared across the application
export const redis = new Redis(config.redis.url, {
  ...config.redis.options,
  // Connection options
  connectTimeout: 20000,
  disconnectTimeout: 5000,
  keepAlive: 30000,
  connectionName: 'verify-service',
  db: 0,
  lazyConnect: true,
  
  // Retry and reconnection
  retryStrategy: function(times) {
    const delay = Math.min(times * 50, 2000);
    console.log('Redis connection attempt:', {
      attempt: times,
      delay,
      timestamp: new Date().toISOString(),
      instance: 'redis-elliptical',
      maxRetries: 20
    });
    if (times > 20) {
      console.error('Max Redis retries reached, giving up');
      return null;
    }
    return delay;
  },
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  
  // Error handling
  reconnectOnError: function(err) {
    const sanitizedError = {
      message: '[Redacted Error Message]',
      code: err.code,
      command: err.command,
      timestamp: new Date().toISOString()
    };
    console.error('Redis reconnect error:', sanitizedError);
    return err.message.includes('READONLY') || 
           err.message.includes('ETIMEDOUT') || 
           err.message.includes('ECONNRESET');
  },
  showFriendlyErrorStack: false,
  
  // Performance options
  enableReadyCheck: true,
  noDelay: true,
  dropBufferSupport: true,
  enableOfflineQueue: true,
  enableAutoPipelining: true,
  commandTimeout: 5000,
  maxLoadingRetryTime: 2000,
  
  // Subscription handling
  autoResubscribe: true,
  autoResendUnfulfilledCommands: true,
  
  // Sentinel options
  enableTLSForSentinelMode: false,
  sentinelRetryStrategy: null
});

// Add more detailed connection event handlers
redis.on('error', (err) => {
  const sanitizedError = {
    message: '[Redacted Error Message]',
    code: err.code,
    timestamp: new Date().toISOString(),
    connectionState: redis.status
  };
  console.error('Redis connection error:', sanitizedError);
});

redis.on('connect', () => {
  console.log('Redis connected successfully', {
    timestamp: new Date().toISOString(),
    instance: 'redis-elliptical',
    connectionState: redis.status
  });
});

redis.on('ready', () => {
  console.log('Redis client ready', {
    timestamp: new Date().toISOString(),
    connectionState: redis.status,
    options: {
      tls: { rejectUnauthorized: false },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      autoResubscribe: true,
      autoResendUnfulfilledCommands: true,
      connectTimeout: 20000,
      disconnectTimeout: 5000,
      keepAlive: 30000,
      noDelay: true,
      commandTimeout: 5000
    }
  });
});

redis.on('reconnecting', (delay) => {
  console.log('Redis reconnecting:', {
    delay,
    timestamp: new Date().toISOString(),
    instance: 'redis-elliptical',
    connectionState: redis.status,
    retryAttempt: redis.retryAttempts
  });
});

redis.on('end', () => {
  console.log('Redis connection ended', {
    timestamp: new Date().toISOString(),
    instance: 'redis-elliptical',
    connectionState: redis.status
  });
});

// Use config values
const BUX_TOKEN_MINT = config.solana.buxMint;
const GUILD_ID = config.discord.guildId;

// Initialize Solana connection from config
const connection = new Connection(config.solana.rpcUrl);

// Add verification message function
export async function sendVerificationMessage(channel) {
  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('BUX DAO Wallet Verification')
    .setDescription('Click the button below to verify your wallet and receive your roles!')
    .setThumbnail('https://i.imgur.com/AfFp7pu.png');

  const button = new ButtonBuilder()
    .setCustomId('verify_wallet')
    .setLabel('Verify Wallet')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder()
    .addComponents(button);

  await channel.send({
    embeds: [embed],
    components: [row]
  });
}

// Load hashlists and convert to Sets
const loadHashlist = async (filename) => {
  try {
    const filePath = path.join(process.cwd(), 'config', 'hashlists', filename);
    const data = await fs.readFile(filePath, 'utf8');
    return new Set(JSON.parse(data));
  } catch (error) {
    console.error(`Error loading hashlist ${filename}:`, error);
    return new Set();
  }
};

let fckedCatzHashlist;
let celebCatzHashlist;
let moneyMonstersHashlist;
let moneyMonsters3dHashlist;
let aiBitbotsHashlist;

// Initialize hashlists
async function initializeHashlists() {
  try {
    fckedCatzHashlist = await loadHashlist('fcked_catz.json');
    celebCatzHashlist = await loadHashlist('celebcatz.json');
    moneyMonstersHashlist = await loadHashlist('money_monsters.json');
    moneyMonsters3dHashlist = await loadHashlist('money_monsters3d.json');
    aiBitbotsHashlist = await loadHashlist('ai_bitbots.json');
    
    console.log('Hashlists loaded:', {
      fckedCatz: fckedCatzHashlist.size,
      celebCatz: celebCatzHashlist.size,
      moneyMonsters: moneyMonstersHashlist.size,
      moneyMonsters3d: moneyMonsters3dHashlist.size,
      aiBitbots: aiBitbotsHashlist.size
    });
  } catch (error) {
    console.error('Error initializing hashlists:', error);
    throw error;
  }
}

// Call initialization
initializeHashlists().catch(console.error);

// Update verifyHolder function to properly check NFT ownership
export async function verifyHolder(walletData, userId, client) {
  try {
    const walletAddress = walletData.walletAddress;
    
    // Validate wallet address
    try {
      new PublicKey(walletAddress);
    } catch (error) {
      return {
        success: false,
        error: 'Invalid wallet address'
      };
    }

    // Get token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(walletAddress),
      { programId: TOKEN_PROGRAM_ID }
    );

    // Create map of mint addresses to token amounts
    const ownedTokens = new Map();
    tokenAccounts.value.forEach(acc => {
      const mint = acc.account.data.parsed.info.mint;
      const amount = parseInt(acc.account.data.parsed.info.tokenAmount.amount);
      if (amount > 0) {
        ownedTokens.set(mint, amount);
      }
    });

    // Check NFT ownership against local hashlists
    const nftCounts = {
      fcked_catz: [],
      celebcatz: [],
      money_monsters: [],
      money_monsters3d: [],
      ai_bitbots: []
    };

    // Helper function to check and add NFTs
    const checkAndAddNFTs = (collection, hashlist) => {
      hashlist.forEach(mint => {
        if (ownedTokens.has(mint) && ownedTokens.get(mint) > 0) {
          nftCounts[collection].push(mint);
        }
      });
    };

    // Check each collection
    checkAndAddNFTs('fcked_catz', fckedCatzHashlist);
    checkAndAddNFTs('celebcatz', celebCatzHashlist);
    checkAndAddNFTs('money_monsters', moneyMonstersHashlist);
    checkAndAddNFTs('money_monsters3d', moneyMonsters3dHashlist);
    checkAndAddNFTs('ai_bitbots', aiBitbotsHashlist);

    // Store NFT counts in Redis
    await redis.hset(`user:${userId}:nfts`, {
      fcked_catz: JSON.stringify(nftCounts.fcked_catz),
      celebcatz: JSON.stringify(nftCounts.celebcatz),
      money_monsters: JSON.stringify(nftCounts.money_monsters),
      money_monsters3d: JSON.stringify(nftCounts.money_monsters3d),
      ai_bitbots: JSON.stringify(nftCounts.ai_bitbots)
    });

    // Store the same data for the wallet
    await redis.hset(`wallet:${walletAddress}:nfts`, {
      fcked_catz: JSON.stringify(nftCounts.fcked_catz),
      celebcatz: JSON.stringify(nftCounts.celebcatz),
      money_monsters: JSON.stringify(nftCounts.money_monsters),
      money_monsters3d: JSON.stringify(nftCounts.money_monsters3d),
      ai_bitbots: JSON.stringify(nftCounts.ai_bitbots)
    });

    // Update Discord roles
    await updateDiscordRoles(userId, client);

    return {
      success: true,
      nftCounts,
      message: 'Wallet verified and roles updated successfully'
    };
  } catch (error) {
    console.error('Error verifying holder:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Update Discord roles function
export async function updateDiscordRoles(userId, client) {
  try {
    // Check if client is ready
    if (!client.isReady()) {
      console.log('Waiting for client to be ready...');
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Client ready timeout')), 5000);
        client.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    // Get guild
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) throw new Error('Guild not found');

    // Get member
    const member = await guild.members.fetch(userId);
    if (!member) throw new Error('Member not found');

    // Get NFT data
    const nftData = await redis.hgetall(`user:${userId}:nfts`);
    if (!nftData) {
      console.log('No NFT data found for user:', userId);
      return;
    }

    // Parse NFT counts
    const nftCounts = {
      fcked_catz: JSON.parse(nftData.fcked_catz || '[]').length,
      celebcatz: JSON.parse(nftData.celebcatz || '[]').length,
      money_monsters: JSON.parse(nftData.money_monsters || '[]').length,
      money_monsters3d: JSON.parse(nftData.money_monsters3d || '[]').length,
      ai_bitbots: JSON.parse(nftData.ai_bitbots || '[]').length
    };

    console.log('NFT counts for role assignment:', nftCounts);

    // Define role assignments with thresholds
    const roleAssignments = [
      { name: 'MONSTER', collection: 'money_monsters', threshold: 1 },
      { name: 'MONSTER 3D', collection: 'money_monsters3d', threshold: 1 },
      { name: 'CAT', collection: 'fcked_catz', threshold: 1 },
      { name: 'CELEB', collection: 'celebcatz', threshold: 1 },
      { name: 'BITBOT', collection: 'ai_bitbots', threshold: 1 },
      { name: 'MONSTER 🐋', collection: 'money_monsters', threshold: 20 },
      { name: 'MONSTER 3D 🐋', collection: 'money_monsters3d', threshold: 20 },
      { name: 'MEGA BOT 🐋', collection: 'ai_bitbots', threshold: 5 },
      { name: 'MEGA CAT 🐋', collection: 'fcked_catz', threshold: 20 },
      { name: 'MEGA CELEB 🐋', collection: 'celebcatz', threshold: 5 }
    ];

    // Update roles
    for (const assignment of roleAssignments) {
      const role = guild.roles.cache.find(r => r.name === assignment.name);
      if (!role) {
        console.log(`Role ${assignment.name} not found`);
        continue;
      }

      const shouldHaveRole = nftCounts[assignment.collection] >= assignment.threshold;
      const hasRole = member.roles.cache.has(role.id);

      if (shouldHaveRole && !hasRole) {
        await member.roles.add(role.id);
        console.log(`Added role ${assignment.name} to user ${userId}`);
      } else if (!shouldHaveRole && hasRole) {
        await member.roles.remove(role.id);
        console.log(`Removed role ${assignment.name} from user ${userId}`);
      }
    }

    console.log('Roles updated for user:', userId, {
      roles: Array.from(member.roles.cache.values()).map(r => r.name),
      nftCounts
    });

  } catch (error) {
    console.error('Error updating Discord roles:', error);
    throw error;
  }
}

// Validate wallet address middleware
export function validateWalletAddress(req, res, next) {
  const { walletAddress } = req.body;
  
  if (!walletAddress) {
    return res.status(400).json({
      success: false,
      error: 'No wallet address provided'
    });
  }

  try {
    new PublicKey(walletAddress);
    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'Invalid wallet address'
    });
  }
}

// Update checkNFTOwnership function to properly handle hashlist loading
export async function checkNFTOwnership(walletAddress) {
  try {
    // Wait for hashlists to be loaded
    if (!fckedCatzHashlist || !celebCatzHashlist || !moneyMonstersHashlist || 
        !moneyMonsters3dHashlist || !aiBitbotsHashlist) {
      console.log('Waiting for hashlists to load...');
      await initializeHashlists();
    }

    // Get token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(walletAddress),
      { programId: TOKEN_PROGRAM_ID }
    );

    // Create map of mint addresses to token amounts
    const ownedTokens = new Map();
    tokenAccounts.value.forEach(acc => {
      const mint = acc.account.data.parsed.info.mint;
      const amount = parseInt(acc.account.data.parsed.info.tokenAmount.amount);
      if (amount > 0) {
        ownedTokens.set(mint, amount);
      }
    });

    // Log owned tokens for debugging
    console.log(`Found ${ownedTokens.size} tokens in wallet ${walletAddress}`);

    // Initialize NFT counts
    const nftCounts = {
      fcked_catz: [],
      celebcatz: [],
      money_monsters: [],
      money_monsters3d: [],
      ai_bitbots: []
    };

    // Helper function to check and add NFTs with detailed logging
    const checkAndAddNFTs = (collection, hashlist) => {
      console.log(`\nChecking ${collection} hashlist (size: ${hashlist.size})`);
      
      hashlist.forEach(mint => {
        if (ownedTokens.has(mint)) {
          const amount = ownedTokens.get(mint);
          if (amount > 0) {
            nftCounts[collection].push(mint);
            console.log(`Found ${collection} NFT: ${mint} (amount: ${amount})`);
          }
        }
      });
      
      console.log(`Found ${nftCounts[collection].length} ${collection} NFTs`);
    };

    // Check each collection
    checkAndAddNFTs('fcked_catz', fckedCatzHashlist);
    checkAndAddNFTs('celebcatz', celebCatzHashlist);
    checkAndAddNFTs('money_monsters', moneyMonstersHashlist);
    checkAndAddNFTs('money_monsters3d', moneyMonsters3dHashlist);
    checkAndAddNFTs('ai_bitbots', aiBitbotsHashlist);

    return nftCounts;

  } catch (error) {
    console.error('Error checking NFT ownership:', error);
    throw error;
  }
}

// Update getBUXBalance to actually check token balance
export async function getBUXBalance(walletAddress) {
  try {
    // Get token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(walletAddress),
      { programId: TOKEN_PROGRAM_ID }
    );

    // Find BUX token account
    const buxAccount = tokenAccounts.value.find(acc => 
      acc.account.data.parsed.info.mint === BUX_TOKEN_MINT
    );

    // Get balance
    const balance = buxAccount ? 
      Number(buxAccount.account.data.parsed.info.tokenAmount.amount) / 1e9 : 
      0;

    // Cache in Redis
    await redis.set(`wallet:${walletAddress}:bux_balance`, balance.toString());

    return balance;

  } catch (error) {
    console.error('Error getting BUX balance:', error);
    throw error;
  }
}
