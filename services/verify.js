import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionsBitField } from 'discord.js';
import Redis from 'ioredis';
import fs from 'fs/promises';
import path from 'path';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { config } from '../config/config.js';  // Changed from './config.js' to '../config/config.js'

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
}

// Call initialization
initializeHashlists().catch(console.error);

// Add rate limiting utility function
const rateLimit = async (fn, delay = 1000) => {
  await new Promise(resolve => setTimeout(resolve, delay));
  return fn();
};

// Move token account fetching into a function
async function getTokenAccounts(walletAddress) {
  try {
    const pubKey = new PublicKey(walletAddress);
    return await rateLimit(() => 
      connection.getParsedTokenAccountsByOwner(pubKey, { programId: TOKEN_PROGRAM_ID })
    );
  } catch (error) {
    console.error('Error fetching token accounts:', error);
    throw error;
  }
}

// Use the function in getBUXBalance
export async function getBUXBalance(walletAddress) {
  try {
    const tokenAccounts = await getTokenAccounts(walletAddress);
    let totalBalance = 0;
    
    for (const account of tokenAccounts.value) {
      if (account.account.data.parsed.info.mint === BUX_TOKEN_MINT) {
        const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
        totalBalance += amount;
      }
    }

    console.log(`Fetched BUX balance for ${walletAddress}: ${totalBalance}`);
    return totalBalance;
  } catch (error) {
    console.error('Error getting BUX balance:', error);
    return 0;
  }
}

// Update the checkNFTOwnership function to use Sets for unique NFTs
export async function checkNFTOwnership(walletAddress) {
  try {
    // Validate wallet address
    const pubKey = new PublicKey(walletAddress);
    
    // Get token accounts with rate limiting
    let tokenAccounts;
    let retries = 3;
    while (retries > 0) {
      try {
        tokenAccounts = await getTokenAccounts(walletAddress);
        break;
      } catch (error) {
        if (error.message.includes('429') && retries > 1) {
          console.log(`Rate limited, retrying in ${(4-retries)*2}s...`);
          await new Promise(resolve => setTimeout(resolve, (4-retries) * 2000));
          retries--;
          continue;
        }
        throw error;
      }
    }

    console.log(`Found ${tokenAccounts.value.length} tokens for wallet ${walletAddress}`);

    // Use Sets to ensure unique NFTs
    const nftCounts = {
      fcked_catz: new Set(),
      celebcatz: new Set(),
      money_monsters: new Set(),
      money_monsters3d: new Set(),
      ai_bitbots: new Set()
    };

    // Use local hashlists to check NFT ownership
    for (const account of tokenAccounts.value) {
      const mint = account.account.data.parsed.info.mint;
      const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
      
      // Only count tokens with amount of 1 (NFTs)
      if (amount !== 1) continue;
      
      // Check against local hashlists and add to Sets
      if (fckedCatzHashlist.has(mint)) {
        nftCounts.fcked_catz.add(mint);
      }
      if (celebCatzHashlist.has(mint)) {
        nftCounts.celebcatz.add(mint);
      }
      if (moneyMonstersHashlist.has(mint)) {
        nftCounts.money_monsters.add(mint);
      }
      if (moneyMonsters3dHashlist.has(mint)) {
        nftCounts.money_monsters3d.add(mint);
      }
      if (aiBitbotsHashlist.has(mint)) {
        nftCounts.ai_bitbots.add(mint);
      }
    }

    // Convert Sets to Arrays for the response
    const result = {
      fcked_catz: Array.from(nftCounts.fcked_catz),
      celebcatz: Array.from(nftCounts.celebcatz),
      money_monsters: Array.from(nftCounts.money_monsters),
      money_monsters3d: Array.from(nftCounts.money_monsters3d),
      ai_bitbots: Array.from(nftCounts.ai_bitbots)
    };

    // Log the results
    Object.entries(result).forEach(([collection, mints]) => {
      if (mints.length > 0) {
        console.log(`Found ${mints.length} ${collection} NFTs:`, mints);
      }
    });

    return result;
  } catch (error) {
    console.error('Error checking NFT ownership:', error);
    throw error;
  }
}

// Get role IDs from environment variables
const ROLE_IDS = {
  FCKED_CATZ: process.env.ROLE_ID_FCKED_CATZ,
  CELEBCATZ: process.env.ROLE_ID_CELEBCATZ,
  MONEY_MONSTERS: process.env.ROLE_ID_MONEY_MONSTERS,
  MONEY_MONSTERS3D: process.env.ROLE_ID_MONEY_MONSTERS3D,
  AI_BITBOTS: process.env.ROLE_ID_AI_BITBOTS,
  MM_TOP10: process.env.ROLE_ID_MM_TOP10,
  MM3D_TOP10: process.env.ROLE_ID_MM3D_TOP10,
  WHALE_FCKED_CATZ: process.env.WHALE_ROLE_ID_FCKED_CATZ,
  WHALE_MONEY_MONSTERS: process.env.WHALE_ROLE_ID_MONEY_MONSTERS,
  WHALE_MONEY_MONSTERS3D: process.env.WHALE_ROLE_ID_MONEY_MONSTERS3D,
  WHALE_AI_BITBOTS: process.env.WHALE_ROLE_ID_AI_BITBOTS,
  BUX_2500: process.env.ROLE_ID_2500_BUX,
  BUX_10000: process.env.ROLE_ID_10000_BUX,
  BUX_25000: process.env.ROLE_ID_25000_BUX,
  BUX_50000: process.env.ROLE_ID_50000_BUX
};

// Get whale thresholds from environment variables
const WHALE_THRESHOLDS = {
  FCKED_CATZ: parseInt(process.env.WHALE_THRESHOLD_FCKED_CATZ),
  MONEY_MONSTERS: parseInt(process.env.WHALE_THRESHOLD_MONEY_MONSTERS),
  MONEY_MONSTERS3D: parseInt(process.env.WHALE_THRESHOLD_MONEY_MONSTERS3D),
  AI_BITBOTS: parseInt(process.env.WHALE_THRESHOLD_AI_BITBOTS)
};

// Add required intents and permissions
const requiredPermissions = [
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages
];

export async function updateDiscordRoles(userId, aggregatedData, client) {
  try {
    if (!client) {
      throw new Error('Discord client is undefined');
    }

    // Wait for client to be ready
    if (!client.isReady()) {
      await new Promise(resolve => client.once('ready', resolve));
    }

    // Get guild from cache first
    let guild = client.guilds.cache.get(GUILD_ID);
    
    // If not in cache, try to fetch
    if (!guild) {
      try {
        guild = await client.guilds.fetch(GUILD_ID);
      } catch (error) {
        console.error('Error fetching guild:', error);
        return false;
      }
    }

    if (!guild) {
      console.error('Guild not found');
      return false;
    }

    // Check bot permissions
    const botMember = guild.members.cache.get(client.user.id);
    if (!botMember) {
      console.error('Bot member not found in guild');
      return false;
    }

    const missingPermissions = requiredPermissions.filter(perm => !botMember.permissions.has(perm));
    if (missingPermissions.length > 0) {
      console.error('Missing required permissions:', missingPermissions);
      return false;
    }

    // Get member from cache first
    let member = guild.members.cache.get(userId);
    
    // If not in cache, try to fetch
    if (!member) {
      try {
        member = await guild.members.fetch(userId);
      } catch (error) {
        console.error('Error fetching member:', error);
        return false;
      }
    }

    if (!member) {
      console.error('Member not found');
      return false;
    }

    console.log('Updating Discord roles based on NFT holdings:', {
      userId,
      nftCounts: {
        fckedCatz: aggregatedData.nftCounts.fcked_catz.length,
        celebCatz: aggregatedData.nftCounts.celebcatz.length,
        moneyMonsters: aggregatedData.nftCounts.money_monsters.length,
        moneyMonsters3d: aggregatedData.nftCounts.money_monsters3d.length,
        aiBitbots: aggregatedData.nftCounts.ai_bitbots.length
      },
      buxBalance: aggregatedData.buxBalance
    });

    const rolesToAdd = [];
    const rolesToRemove = [];

    // NFT Collection roles
    if (aggregatedData.nftCounts.fcked_catz.length > 0) {
      rolesToAdd.push(ROLE_IDS.FCKED_CATZ);
      if (aggregatedData.nftCounts.fcked_catz.length >= WHALE_THRESHOLDS.FCKED_CATZ) {
        rolesToAdd.push(ROLE_IDS.WHALE_FCKED_CATZ);
      }
    } else {
      rolesToRemove.push(ROLE_IDS.FCKED_CATZ);
      rolesToRemove.push(ROLE_IDS.WHALE_FCKED_CATZ);
    }

    if (aggregatedData.nftCounts.celebcatz.length > 0) {
      rolesToAdd.push(ROLE_IDS.CELEBCATZ);
    } else {
      rolesToRemove.push(ROLE_IDS.CELEBCATZ);
    }

    if (aggregatedData.nftCounts.money_monsters.length > 0) {
      rolesToAdd.push(ROLE_IDS.MONEY_MONSTERS);
      if (aggregatedData.nftCounts.money_monsters.length >= WHALE_THRESHOLDS.MONEY_MONSTERS) {
        rolesToAdd.push(ROLE_IDS.WHALE_MONEY_MONSTERS);
      }
    } else {
      rolesToRemove.push(ROLE_IDS.MONEY_MONSTERS);
      rolesToRemove.push(ROLE_IDS.WHALE_MONEY_MONSTERS);
    }

    if (aggregatedData.nftCounts.money_monsters3d.length > 0) {
      rolesToAdd.push(ROLE_IDS.MONEY_MONSTERS3D);
      if (aggregatedData.nftCounts.money_monsters3d.length >= WHALE_THRESHOLDS.MONEY_MONSTERS3D) {
        rolesToAdd.push(ROLE_IDS.WHALE_MONEY_MONSTERS3D);
      }
    } else {
      rolesToRemove.push(ROLE_IDS.MONEY_MONSTERS3D);
      rolesToRemove.push(ROLE_IDS.WHALE_MONEY_MONSTERS3D);
    }

    if (aggregatedData.nftCounts.ai_bitbots.length > 0) {
      rolesToAdd.push(ROLE_IDS.AI_BITBOTS);
      if (aggregatedData.nftCounts.ai_bitbots.length >= WHALE_THRESHOLDS.AI_BITBOTS) {
        rolesToAdd.push(ROLE_IDS.WHALE_AI_BITBOTS);
      }
    } else {
      rolesToRemove.push(ROLE_IDS.AI_BITBOTS);
      rolesToRemove.push(ROLE_IDS.WHALE_AI_BITBOTS);
    }

    // BUX Balance roles
    if (aggregatedData.buxBalance >= 50000) {
      rolesToAdd.push(ROLE_IDS.BUX_50000);
      rolesToAdd.push(ROLE_IDS.BUX_25000);
      rolesToAdd.push(ROLE_IDS.BUX_10000);
      rolesToAdd.push(ROLE_IDS.BUX_2500);
    } else if (aggregatedData.buxBalance >= 25000) {
      rolesToAdd.push(ROLE_IDS.BUX_25000);
      rolesToAdd.push(ROLE_IDS.BUX_10000);
      rolesToAdd.push(ROLE_IDS.BUX_2500);
      rolesToRemove.push(ROLE_IDS.BUX_50000);
    } else if (aggregatedData.buxBalance >= 10000) {
      rolesToAdd.push(ROLE_IDS.BUX_10000);
      rolesToAdd.push(ROLE_IDS.BUX_2500);
      rolesToRemove.push(ROLE_IDS.BUX_50000);
      rolesToRemove.push(ROLE_IDS.BUX_25000);
    } else if (aggregatedData.buxBalance >= 2500) {
      rolesToAdd.push(ROLE_IDS.BUX_2500);
      rolesToRemove.push(ROLE_IDS.BUX_50000);
      rolesToRemove.push(ROLE_IDS.BUX_25000);
      rolesToRemove.push(ROLE_IDS.BUX_10000);
    } else {
      rolesToRemove.push(ROLE_IDS.BUX_50000);
      rolesToRemove.push(ROLE_IDS.BUX_25000);
      rolesToRemove.push(ROLE_IDS.BUX_10000);
      rolesToRemove.push(ROLE_IDS.BUX_2500);
    }

    // Add roles with error handling and position check
    for (const roleId of rolesToAdd) {
      try {
        const role = guild.roles.cache.get(roleId);
        if (!role) {
          console.error(`Role ${roleId} not found`);
          continue;
        }

        // Check if bot's highest role is above the role to be assigned
        if (botMember.roles.highest.comparePositionTo(role) <= 0) {
          console.error(`Bot's highest role is not high enough to assign role ${roleId}`);
          continue;
        }

        if (!member.roles.cache.has(roleId)) {
          await member.roles.add(roleId);
          console.log(`Added role ${role.name} (${roleId}) to user ${userId}`);
        }
      } catch (error) {
        console.error(`Error adding role ${roleId}:`, error);
      }
    }

    // Remove roles with error handling and position check
    for (const roleId of rolesToRemove) {
      try {
        const role = guild.roles.cache.get(roleId);
        if (!role) {
          console.error(`Role ${roleId} not found`);
          continue;
        }

        // Check if bot's highest role is above the role to be removed
        if (botMember.roles.highest.comparePositionTo(role) <= 0) {
          console.error(`Bot's highest role is not high enough to remove role ${roleId}`);
          continue;
        }

        if (member.roles.cache.has(roleId)) {
          await member.roles.remove(roleId);
          console.log(`Removed role ${role.name} (${roleId}) from user ${userId}`);
        }
      } catch (error) {
        console.error(`Error removing role ${roleId}:`, error);
      }
    }

    console.log('Updated roles for user', userId + ':', {
      added: rolesToAdd,
      removed: rolesToRemove
    });

    return true;
  } catch (error) {
    console.error('Error updating Discord roles:', error);
    return false;
  }
}

function formatNFTCounts(nftCounts) {
  return Object.entries(nftCounts)
    .map(([collection, nfts]) => `${collection}: ${nfts.length}`)
    .join('\n');
}

export async function verifyHolder(walletData, userId, client) {
  try {
    const walletAddress = walletData.walletAddress;
    console.log(`Verifying wallet: ${walletAddress}`);
    
    // Validate wallet address format
    if (typeof walletAddress !== 'string' || walletAddress.length !== 44) {
      throw new Error('Invalid wallet address format');
    }

    try {
      new PublicKey(walletAddress);
    } catch (err) {
      throw new Error('Invalid Solana wallet address');
    }

    const nftCounts = await checkNFTOwnership(walletAddress);
    console.log('NFT counts:', nftCounts);
    
    const buxBalance = await getBUXBalance(walletAddress);
    console.log('BUX balance:', buxBalance);
    
    const rolesUpdated = await updateDiscordRoles(userId, { nftCounts, buxBalance }, client);
    
    return {
      success: true,
      rolesUpdated,
      nftCounts,
      buxBalance,
      formattedResponse: `Successfully verified wallet!\n\n**NFT Holdings**:\n${formatNFTCounts(nftCounts)}\n\n**BUX Balance**: ${buxBalance} BUX`
    };
  } catch (error) {
    console.error('Error in verifyHolder:', error);
    throw error;
  }
}

// Instead, export the middleware
export const validateWalletAddress = (req, res, next) => {
  const { walletAddress } = req.body;
  
  if (!walletAddress || typeof walletAddress !== 'string' || walletAddress.length !== 44) {
    return res.status(400).json({
      success: false,
      error: 'Invalid wallet address format'
    });
  }
  
  try {
    new PublicKey(walletAddress);
    next();
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'Invalid Solana wallet address'
    });
  }
};
