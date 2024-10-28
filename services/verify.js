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

// Verify holder function
export async function verifyHolder(walletData, userId, client) {
  try {
    const walletAddress = walletData.walletAddress;
    const publicKey = new PublicKey(walletAddress);
    
    // Get token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
      programId: TOKEN_PROGRAM_ID
    });

    // Check NFT ownership
    const nftCounts = {
      fcked_catz: Array.from(fckedCatzHashlist).filter(mint => 
        tokenAccounts.value.some(acc => acc.account.data.parsed.info.mint === mint)),
      celebcatz: Array.from(celebCatzHashlist).filter(mint => 
        tokenAccounts.value.some(acc => acc.account.data.parsed.info.mint === mint)),
      money_monsters: Array.from(moneyMonstersHashlist).filter(mint => 
        tokenAccounts.value.some(acc => acc.account.data.parsed.info.mint === mint)),
      money_monsters3d: Array.from(moneyMonsters3dHashlist).filter(mint => 
        tokenAccounts.value.some(acc => acc.account.data.parsed.info.mint === mint)),
      ai_bitbots: Array.from(aiBitbotsHashlist).filter(mint => 
        tokenAccounts.value.some(acc => acc.account.data.parsed.info.mint === mint))
    };

    // Store NFT counts in Redis
    await redis.hset(`user:${userId}:nfts`, nftCounts);

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

// Add this function after the existing functions
export async function checkNFTOwnership(walletAddress) {
  try {
    const publicKey = new PublicKey(walletAddress);
    
    // Get token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
      programId: TOKEN_PROGRAM_ID
    });

    // Check NFT ownership
    return {
      fcked_catz: Array.from(fckedCatzHashlist).filter(mint => 
        tokenAccounts.value.some(acc => acc.account.data.parsed.info.mint === mint)),
      celebcatz: Array.from(celebCatzHashlist).filter(mint => 
        tokenAccounts.value.some(acc => acc.account.data.parsed.info.mint === mint)),
      money_monsters: Array.from(moneyMonstersHashlist).filter(mint => 
        tokenAccounts.value.some(acc => acc.account.data.parsed.info.mint === mint)),
      money_monsters3d: Array.from(moneyMonsters3dHashlist).filter(mint => 
        tokenAccounts.value.some(acc => acc.account.data.parsed.info.mint === mint)),
      ai_bitbots: Array.from(aiBitbotsHashlist).filter(mint => 
        tokenAccounts.value.some(acc => acc.account.data.parsed.info.mint === mint))
    };
  } catch (error) {
    console.error('Error checking NFT ownership:', error);
    throw error;
  }
}

// Add this function after checkNFTOwnership
export async function getBUXBalance(walletAddress) {
  try {
    const publicKey = new PublicKey(walletAddress);
    
    // Get token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
      programId: TOKEN_PROGRAM_ID
    });

    // Find BUX token account
    const buxAccount = tokenAccounts.value.find(acc => 
      acc.account.data.parsed.info.mint === BUX_TOKEN_MINT
    );

    if (!buxAccount) {
      return 0;
    }

    return parseInt(buxAccount.account.data.parsed.info.tokenAmount.amount) / 1e9;
  } catch (error) {
    console.error('Error getting BUX balance:', error);
    throw error;
  }
}
