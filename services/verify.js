import { connection } from '../config/solana.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { redis } from '../config/redis.js';
import { config } from '../config/config.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize hashlists with empty Sets
export let hashlists = {
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

// Load hashlist from JSON file
async function loadHashlist(filename) {
  try {
    const filePath = path.join(__dirname, '..', 'config', 'hashlists', filename);
    const data = await fs.readFile(filePath, 'utf8');
    return new Set(JSON.parse(data));
  } catch (error) {
    console.error(`Error loading hashlist ${filename}:`, error);
    return new Set();
  }
}

// Initialize hashlists on startup
export async function initializeHashlists() {
  try {
    hashlists.fckedCatz = await loadHashlist('fcked_catz.json');
    hashlists.celebCatz = await loadHashlist('celebcatz.json');
    hashlists.moneyMonsters = await loadHashlist('money_monsters.json');
    hashlists.moneyMonsters3d = await loadHashlist('money_monsters3d.json');
    hashlists.aiBitbots = await loadHashlist('ai_bitbots.json');
    hashlists.mmTop10 = await loadHashlist('MM_top10.json');
    hashlists.mm3dTop10 = await loadHashlist('MM3D_top10.json');
    hashlists.warriors = await loadHashlist('ai_collabs/warriors.json');
    hashlists.squirrels = await loadHashlist('ai_collabs/squirrels.json');
    hashlists.rjctdBots = await loadHashlist('ai_collabs/rjctd_bots.json');
    hashlists.energyApes = await loadHashlist('ai_collabs/energy_apes.json');
    hashlists.doodleBots = await loadHashlist('ai_collabs/doodle_bot.json');
    hashlists.candyBots = await loadHashlist('ai_collabs/candy_bots.json');

    console.log('Hashlists loaded:', {
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
  } catch (error) {
    console.error('Error initializing hashlists:', error);
  }
}

// Add function to update hashlists
export function updateHashlists(newHashlists) {
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

// Initialize Redis first
redis.on('error', (err) => {
  console.error('Redis error:', err);
  process.exit(1);
});

redis.on('ready', () => {
  console.log('Redis connected and ready');
  console.log('Hashlists initialized with:', {
    fckedCatz: hashlists.fckedCatz.size,
    celebCatz: hashlists.celebCatz.size,
    moneyMonsters: hashlists.moneyMonsters.size,
    moneyMonsters3d: hashlists.moneyMonsters3d.size,
    aiBitbots: hashlists.aiBitbots.size,
    mmTop10: hashlists.mmTop10.size,
    mm3dTop10: hashlists.mm3dTop10.size,
    squirrels: hashlists.squirrels.size,
    rjctdBots: hashlists.rjctdBots.size,
    energyApes: hashlists.energyApes.size,
    doodleBots: hashlists.doodleBots.size,
    candyBots: hashlists.candyBots.size
  });
});

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

// Export all required functions
export { redis };

export async function getBUXBalance(walletAddress) {
  try {
    console.log('Getting BUX balance for wallet:', walletAddress);
    console.log('Using BUX token mint:', process.env.BUX_TOKEN_MINT);

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(walletAddress),
      { programId: TOKEN_PROGRAM_ID }
    );

    console.log('Found token accounts:', tokenAccounts.value.length);

    let buxBalance = 0;
    for (const acc of tokenAccounts.value) {
      const mint = acc.account.data.parsed.info.mint;
      console.log('Checking token mint:', mint);
      
      if (mint === process.env.BUX_TOKEN_MINT) {
        const amount = parseInt(acc.account.data.parsed.info.tokenAmount.amount);
        console.log('Found BUX token with amount:', amount);
        buxBalance += amount;
      }
    }

    console.log('Final BUX balance:', buxBalance);
    await redis.set(`bux:${walletAddress}`, buxBalance.toString());
    
    return buxBalance;
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

export async function updateDiscordRoles(userId, client) {
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

// Add verifyHolder function and export it
export async function verifyHolder(data, userId, client) {
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

// Add export for verifyWallet
export async function verifyWallet(userId, walletAddress) {
  try {
    // Add wallet to user's set in Redis
    await redis.sadd(`wallets:${userId}`, walletAddress);
    
    // Return success
    return {
      userId,
      walletAddress,
      success: true
    };
  } catch (error) {
    console.error('Error verifying wallet:', error);
    throw error;
  }
}

// Export everything else in one statement
export {
  updateDiscordRoles,
  updateHashlists,
  getBUXBalance,
  hashlists
};
