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

    // Get owned token mints
    const ownedMints = tokenAccounts.value.map(acc => 
      acc.account.data.parsed.info.mint
    );

    // Check NFT ownership against local hashlists
    const nftCounts = {
      fcked_catz: Array.from(fckedCatzHashlist).filter(mint => 
        ownedMints.includes(mint)
      ),
      celebcatz: Array.from(celebCatzHashlist).filter(mint => 
        ownedMints.includes(mint)
      ),
      money_monsters: Array.from(moneyMonstersHashlist).filter(mint => 
        ownedMints.includes(mint)
      ),
      money_monsters3d: Array.from(moneyMonsters3dHashlist).filter(mint => 
        ownedMints.includes(mint)
      ),
      ai_bitbots: Array.from(aiBitbotsHashlist).filter(mint => 
        ownedMints.includes(mint)
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
    // Wait for client to be ready
    if (!client.isReady()) {
      console.log('Waiting for client to be ready...');
      await new Promise(resolve => client.once('ready', resolve));
    }

    // Get guild directly from client
    let guild = client.guilds.cache.get(process.env.GUILD_ID);
    
    if (!guild) {
      console.error('Guild not found in cache:', {
        guildId: process.env.GUILD_ID,
        availableGuilds: Array.from(client.guilds.cache.keys()),
        clientStatus: client.isReady() ? 'ready' : 'not ready'
      });
      
      // Try to fetch guild
      try {
        guild = await client.guilds.fetch(process.env.GUILD_ID);
        if (guild) {
          console.log('Successfully fetched guild:', guild.name);
        } else {
          throw new Error('Guild not found after fetch attempt');
        }
      } catch (fetchError) {
        console.error('Error fetching guild:', fetchError);
        throw new Error('Guild not found and fetch failed');
      }
    }

    // Ensure roles are cached
    const roles = await guild.roles.fetch();
    console.log('Available roles:', Array.from(roles.cache.values()).map(r => r.name));

    // Fetch member with force refresh
    const member = await guild.members.fetch(userId);
    if (!member) {
      console.error('Member not found:', userId);
      throw new Error('Member not found');
    }
    
    // Get NFT counts from Redis
    const nftCounts = await redis.hgetall(`user:${userId}:nfts`);
    if (!nftCounts) {
      console.log('No NFT data found for user:', userId);
      return;
    }
    
    // Parse NFT data
    const parsedCounts = {
      fcked_catz: nftCounts.fcked_catz ? JSON.parse(nftCounts.fcked_catz).length : 0,
      celebcatz: nftCounts.celebcatz ? JSON.parse(nftCounts.celebcatz).length : 0,
      money_monsters: nftCounts.money_monsters ? JSON.parse(nftCounts.money_monsters).length : 0,
      money_monsters3d: nftCounts.money_monsters3d ? JSON.parse(nftCounts.money_monsters3d).length : 0,
      ai_bitbots: nftCounts.ai_bitbots ? JSON.parse(nftCounts.ai_bitbots).length : 0
    };
    
    console.log('Parsed NFT counts for user:', userId, parsedCounts);
    
    // Update roles based on NFT ownership
    const roleUpdates = [];
    if (parsedCounts.fcked_catz > 0) roleUpdates.push('CAT');
    if (parsedCounts.celebcatz > 0) roleUpdates.push('CELEB');
    if (parsedCounts.money_monsters > 0) roleUpdates.push('MONSTER');
    if (parsedCounts.money_monsters3d > 0) roleUpdates.push('MONSTER 3D');
    if (parsedCounts.ai_bitbots > 0) roleUpdates.push('BITBOT');
    
    console.log('Role updates needed for user:', userId, roleUpdates);
    
    // Add roles to member
    for (const roleName of roleUpdates) {
      const role = guild.roles.cache.find(r => r.name === roleName);
      if (!role) {
        console.error(`Role not found: ${roleName}, available roles:`, 
          Array.from(guild.roles.cache.values()).map(r => r.name));
        continue;
      }
      
      if (!member.roles.cache.has(role.id)) {
        try {
          await member.roles.add(role);
          console.log(`Added role ${roleName} to user ${userId}`);
        } catch (error) {
          console.error(`Error adding role ${roleName} to user ${userId}:`, error);
        }
      } else {
        console.log(`User ${userId} already has role ${roleName}`);
      }
    }
  } catch (error) {
    console.error('Error updating Discord roles:', {
      userId,
      error: error.message,
      stack: error.stack,
      guildId: process.env.GUILD_ID,
      clientReady: client.isReady(),
      availableGuilds: Array.from(client.guilds.cache.keys())
    });
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
    // Get stored NFT data from Redis
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

    // If no cached data, return empty arrays
    return {
      fcked_catz: [],
      celebcatz: [],
      money_monsters: [],
      money_monsters3d: [],
      ai_bitbots: []
    };
  } catch (error) {
    console.error('Error checking NFT ownership:', {
      walletAddress,
      error: error.message,
      stack: error.stack
    });
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
