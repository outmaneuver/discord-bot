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
const GUILD_ID = '1093606438674382858'; // Hardcode the guild ID

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
    const filePath = path.join(process.cwd(), 'hashlists', filename);
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

export async function getBUXBalance(walletAddress) {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(walletAddress),
      {
        programId: TOKEN_PROGRAM_ID,
        mint: new PublicKey(BUX_TOKEN_MINT)
      }
    );

    let totalBalance = 0;
    for (const account of tokenAccounts.value) {
      const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
      totalBalance += amount;
    }

    console.log(`Fetched BUX balance for ${walletAddress}: ${totalBalance}`);
    return totalBalance;
  } catch (error) {
    console.error('Error getting BUX balance:', error);
    return 0;
  }
}

export async function checkNFTOwnership(walletAddress) {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(walletAddress),
      { programId: TOKEN_PROGRAM_ID }
    );

    console.log(`Found ${tokenAccounts.value.length} tokens for wallet ${walletAddress}`);

    const nftCounts = {
      fcked_catz: [],
      celebcatz: [],
      money_monsters: [],
      money_monsters3d: [],
      ai_bitbots: []
    };

    for (const account of tokenAccounts.value) {
      const mint = account.account.data.parsed.info.mint;
      
      if (fckedCatzHashlist.has(mint)) {
        nftCounts.fcked_catz.push(mint);
      }
      if (celebCatzHashlist.has(mint)) {
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

    return nftCounts;
  } catch (error) {
    console.error('Error checking NFT ownership:', error);
    throw error;
  }
}

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
        return;
      }
    }

    if (!guild) {
      console.error('Guild not found');
      return;
    }

    // Get member from cache first
    let member = guild.members.cache.get(userId);
    
    // If not in cache, try to fetch
    if (!member) {
      try {
        member = await guild.members.fetch(userId);
      } catch (error) {
        console.error('Error fetching member:', error);
        return;
      }
    }

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

// Rest of verify.js remains the same...

export async function verifyHolder(walletAddress, userId, client) {
  console.log(`Verifying wallet: ${walletAddress}`);
  try {
    const nftCounts = await checkNFTOwnership(walletAddress);
    console.log('NFT counts:', nftCounts);
    
    const buxBalance = await getBUXBalance(walletAddress);
    console.log('BUX balance:', buxBalance);
    
    const rolesUpdated = await updateDiscordRoles(userId, { nftCounts, buxBalance }, client);
    
    return {
      success: true,
      rolesUpdated,
      nftCounts,
      buxBalance
    };
  } catch (error) {
    console.error('Error in verifyHolder:', error);
    throw error;
  }
}
