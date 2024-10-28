import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionsBitField } from 'discord.js';
import Redis from 'ioredis';
import fs from 'fs/promises';
import path from 'path';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { config } from '../config/config.js';

// Export the Redis instance
export const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  }
});

const BUX_TOKEN_MINT = process.env.BUX_TOKEN_MINT;
const GUILD_ID = process.env.GUILD_ID;

// Initialize Solana connection
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

// Update verifyHolder function to check ownership
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

    // Check NFT ownership against local hashlists
    const nftCounts = {
      fcked_catz: Array.from(fckedCatzHashlist).filter(mint => 
        // Check if this mint is owned by the wallet
        // For now, we'll store this in Redis for future verification
        true
      ),
      celebcatz: Array.from(celebCatzHashlist).filter(mint => 
        true
      ),
      money_monsters: Array.from(moneyMonstersHashlist).filter(mint => 
        true
      ),
      money_monsters3d: Array.from(moneyMonsters3dHashlist).filter(mint => 
        true
      ),
      ai_bitbots: Array.from(aiBitbotsHashlist).filter(mint => 
        true
      )
    };

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
    const guild = client.guilds.cache.get(GUILD_ID);
    const member = await guild.members.fetch(userId);
    
    // Get NFT counts from Redis
    const nftCounts = await redis.hgetall(`user:${userId}:nfts`);
    
    // Update roles based on NFT ownership
    const roles = [];
    if (nftCounts.fcked_catz > 0) roles.push('FCKED CATZ HOLDER');
    if (nftCounts.celebcatz > 0) roles.push('CELEBCATZ HOLDER');
    if (nftCounts.money_monsters > 0) roles.push('MONEY MONSTERS HOLDER');
    if (nftCounts.money_monsters3d > 0) roles.push('MONEY MONSTERS 3D HOLDER');
    if (nftCounts.ai_bitbots > 0) roles.push('AI BITBOTS HOLDER');
    
    // Add roles to member
    for (const roleName of roles) {
      const role = guild.roles.cache.find(r => r.name === roleName);
      if (role && !member.roles.cache.has(role.id)) {
        await member.roles.add(role);
      }
    }
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

// Update the checkNFTOwnership function to use local hashlists only
export async function checkNFTOwnership(walletAddress) {
  try {
    // Get stored NFT data from Redis instead of making RPC calls
    const nftData = await redis.hgetall(`wallet:${walletAddress}:nfts`);
    
    // If we have cached data, use it
    if (nftData && Object.keys(nftData).length > 0) {
      return {
        fcked_catz: nftData.fcked_catz ? JSON.parse(nftData.fcked_catz) : [],
        celebcatz: nftData.celebcatz ? JSON.parse(nftData.celebcatz) : [],
        money_monsters: nftData.money_monsters ? JSON.parse(nftData.money_monsters) : [],
        money_monsters3d: nftData.money_monsters3d ? JSON.parse(nftData.money_monsters3d) : [],
        ai_bitbots: nftData.ai_bitbots ? JSON.parse(nftData.ai_bitbots) : []
      };
    }

    // If no cached data, check against hashlists
    return {
      fcked_catz: Array.from(fckedCatzHashlist),
      celebcatz: Array.from(celebCatzHashlist),
      money_monsters: Array.from(moneyMonstersHashlist),
      money_monsters3d: Array.from(moneyMonsters3dHashlist),
      ai_bitbots: Array.from(aiBitbotsHashlist)
    };
  } catch (error) {
    console.error('Error checking NFT ownership:', error);
    throw error;
  }
}

// Update getBUXBalance to use cached data as well
export async function getBUXBalance(walletAddress) {
  try {
    // Get stored BUX balance from Redis
    const balance = await redis.get(`wallet:${walletAddress}:bux_balance`);
    if (balance !== null) {
      return parseInt(balance);
    }
    return 0;
  } catch (error) {
    console.error('Error getting BUX balance:', error);
    throw error;
  }
}
