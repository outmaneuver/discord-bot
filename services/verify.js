import { connection } from '../config/solana.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { redis } from '../config/redis.js';

// Export redis so it can be imported by other modules
export { redis };

// Add getBUXBalance function and export it
export async function getBUXBalance(walletAddress) {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(walletAddress),
      { programId: TOKEN_PROGRAM_ID }
    );

    let buxBalance = 0;
    for (const acc of tokenAccounts.value) {
      if (acc.account.data.parsed.info.mint === process.env.BUX_TOKEN_MINT) {
        buxBalance += parseInt(acc.account.data.parsed.info.tokenAmount.amount);
      }
    }
    return buxBalance;
  } catch (error) {
    console.error('Error getting BUX balance:', error);
    return 0;
  }
}

// Initialize hashlists with hardcoded data
let hashlists = {
  fckedCatz: new Set([
    "BsarXX8ByP61bQaxHB1BumzjJHZipySbkAZM9HTsGHnZ",
    "ti93mWDrGoN4F3L9QbceWWrPDyy6rG8p4SxcwqNneT4",
    // ... rest of fcked_catz addresses
  ]),
  
  celebCatz: new Set([
    "27AZCipUgnokLraJiFRzihNbVkC1p1BFwo7yYy8Dehwg",
    "2AMCTGkrxMsPoYsEi3k5HoHqBV71yZvCfhJ7qkhj8sfv",
    // ... rest of celebcatz addresses
  ]),
  
  moneyMonsters: new Set([
    "5BZFAbdrh7C41RMa9i8mdMwKy4L2yij4AVWDPMx5Jr6h",
    "CgiAp4FwF8uv2oQ18pB7KsVSCotX9MrX3LU5aCzZHJ2s",
    // ... rest of money_monsters addresses
  ]),
  
  moneyMonsters3d: new Set([
    "5WhqtK8P9ycdaH7sDPccm6zwxBQoGB2Eoq6n6FFxGdXi",
    "8vLh5iEvNNT85h7hucsCWQ9MPNNeHXUiQsaEgT8yXssT",
    // ... rest of money_monsters3d addresses
  ]),
  
  aiBitbots: new Set([
    "2AMwhQ1VJE5XrChgLAAN2ho67Z3Kd6G6ZH9K3tUDaeAj",
    "2DFivijFtTUrG8wU1yG6zguPNDatCfc8oggKkcMtPtDK",
    // ... rest of ai_bitbots addresses
  ]),
  
  // Top 10 collections
  mmTop10: new Set([
    "DjBWcV9MMDYT184mZex1FokGo9RiR5HKcLi8RA7vMF1V",
    "2PNNMgdVLpxjDY2DsUCmB1gf7pVNenrydWBiWCZxxDxG",
    // ... rest of MM_top10 addresses
  ]),
  
  mm3dTop10: new Set([
    "C4SNQtPwPVt5k1tju9QVFK4PuiU32SJt7pZjBPNUA2X9",
    "CPBmgYsyLc6Y7aqRJvrpiaBBmB5DtQiisX4dFLpGkELT",
    // ... rest of MM3D_top10 addresses
  ]),
  
  // AI Collabs
  squirrels: new Set([
    "53uo3rxsC581PogRokje1heL9guwVDHWGJgizCsH8Lhq",
    "5mh8x7Mtr4LbPmxUWNjj8ub7RAwf2mDyTeJ5RnqZgi7S",
    // ... rest of squirrels addresses
  ]),
  
  rjctdBots: new Set([
    "6bFtMFRA62sPJFioZkARRU1FNruEPMJ4KRswwkXyYzQ9",
    "5sLRard2DHmwYjtR6eadJm61PWBn3zFrhX1bQcaowqT7",
    // ... rest of rjctd_bots addresses
  ]),
  
  energyApes: new Set([
    "GhYWZ23HBe4c5srSSrVg1TtN734a9fLFdG4dxvt4NRNP",
    "4oM1zXktE85P7o4e9Zps5FAwZRdTCu11XLMKZ1gUbbYN",
    // ... rest of energy_apes addresses
  ]),
  
  doodleBots: new Set([
    "298Lo9g3mKS925ZZDdcuq3WmEZeooxok1GXq16YMSCNh",
    "GG71RzW86XYc5VVvBmHDy8xRC8w3qYNY4zKHoMEvVfP",
    // ... rest of doodle_bot addresses
  ]),
  
  candyBots: new Set([
    "5WSgTYGEyvwrSPzZ8iJcvGHNJcFKYzhadgsiah26HLgn",
    "HVRdxDPXymftQA6BDbNHJbB8Lp1XQwobFQMx8MYijv2U",
    // ... rest of candy_bots addresses
  ])
};

// No need for loadHashlists function anymore since data is hardcoded

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

export async function checkNFTOwnership(walletAddress) {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(walletAddress),
      { programId: TOKEN_PROGRAM_ID }
    );

    const nftCounts = {
      fcked_catz: new Set(),
      celebcatz: new Set(),
      money_monsters: new Set(),
      money_monsters3d: new Set(),
      ai_bitbots: new Set(),
      mm_top10: new Set(),
      mm3d_top10: new Set(),
      squirrels: new Set(),
      rjctd_bots: new Set(),
      energy_apes: new Set(),
      doodle_bots: new Set(),
      candy_bots: new Set()
    };

    for (const acc of tokenAccounts.value) {
      const mint = acc.account.data.parsed.info.mint;
      const amount = parseInt(acc.account.data.parsed.info.tokenAmount.amount);
      
      if (amount > 0) {
        if (hashlists.fckedCatz.has(mint)) nftCounts.fcked_catz.add(mint);
        if (hashlists.celebCatz.has(mint)) nftCounts.celebcatz.add(mint);
        if (hashlists.moneyMonsters.has(mint)) nftCounts.money_monsters.add(mint);
        if (hashlists.moneyMonsters3d.has(mint)) nftCounts.money_monsters3d.add(mint);
        if (hashlists.aiBitbots.has(mint)) nftCounts.ai_bitbots.add(mint);
        if (hashlists.mmTop10.has(mint)) nftCounts.mm_top10.add(mint);
        if (hashlists.mm3dTop10.has(mint)) nftCounts.mm3d_top10.add(mint);
        if (hashlists.squirrels.has(mint)) nftCounts.squirrels.add(mint);
        if (hashlists.rjctdBots.has(mint)) nftCounts.rjctd_bots.add(mint);
        if (hashlists.energyApes.has(mint)) nftCounts.energy_apes.add(mint);
        if (hashlists.doodleBots.has(mint)) nftCounts.doodle_bots.add(mint);
        if (hashlists.candyBots.has(mint)) nftCounts.candy_bots.add(mint);
      }
    }

    return {
      fcked_catz: Array.from(nftCounts.fcked_catz),
      celebcatz: Array.from(nftCounts.celebcatz),
      money_monsters: Array.from(nftCounts.money_monsters),
      money_monsters3d: Array.from(nftCounts.money_monsters3d),
      ai_bitbots: Array.from(nftCounts.ai_bitbots),
      mm_top10: Array.from(nftCounts.mm_top10),
      mm3d_top10: Array.from(nftCounts.mm3d_top10),
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
  FCKED_CATZ: process.env.ROLE_FCKED_CATZ,
  CELEBCATZ: process.env.ROLE_CELEBCATZ,
  MONEY_MONSTERS: process.env.ROLE_MONEY_MONSTERS,
  MONEY_MONSTERS_3D: process.env.ROLE_MONEY_MONSTERS_3D,
  AI_BITBOTS: process.env.ROLE_AI_BITBOTS,
  
  // Top holders
  MM_TOP_10: process.env.ROLE_MM_TOP_10,
  MM3D_TOP_10: process.env.ROLE_MM3D_TOP_10,
  
  // AI Collabs with exact role IDs from .env
  WARRIORS: process.env.ROLE_ID_WARRIORS,      // 1300968343783735296
  SQUIRRELS: process.env.ROLE_ID_SQUIRRELS,    // 1300968613179686943
  ENERGY_APES: process.env.ROLE_ID_ENERGY_APES, // 1300968964276621313
  CANDY_BOTS: process.env.ROLE_ID_CANDY_BOTS,  // 1300969268665389157
  RJCTD_BOTS: process.env.ROLE_ID_RJCTD_BOTS,  // 1300969147441610773
  DOODLE_BOTS: process.env.ROLE_ID_DOODLE_BOTS // 1300969353952362557
};

// Update assignRoles function to handle all collections
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

    // Top holders
    if (nftCounts.mm_top10.length > 0) newRoles.add(ROLES.MM_TOP_10);
    if (nftCounts.mm3d_top10.length > 0) newRoles.add(ROLES.MM3D_TOP_10);

    // AI Collabs
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

// Helper function to compare sets
function setsAreEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

// Add and export updateDiscordRoles function
export async function updateDiscordRoles(userId, client) {
  try {
    const guildId = config.discord.guildId;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) throw new Error('Guild not found');

    const member = await guild.members.fetch(userId);
    if (!member) throw new Error('Member not found');

    // Get wallet data
    const wallets = await redis.smembers(`wallets:${userId}`);
    if (!wallets || wallets.length === 0) {
      console.log('No wallets found for user:', userId);
      return false;
    }

    // Check NFTs for all wallets
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

    for (const wallet of wallets) {
      const nfts = await checkNFTOwnership(wallet);
      Object.entries(nfts).forEach(([collection, tokens]) => {
        tokens.forEach(token => nftCounts[collection].add(token));
      });
    }

    // Update roles based on NFT holdings
    const currentRoles = new Set(member.roles.cache.map(role => role.id));
    const newRoles = new Set(currentRoles);

    // Add roles based on NFT holdings
    if (nftCounts.fcked_catz.size > 0) newRoles.add(ROLES.FCKED_CATZ);
    if (nftCounts.celebcatz.size > 0) newRoles.add(ROLES.CELEBCATZ);
    if (nftCounts.money_monsters.size > 0) newRoles.add(ROLES.MONEY_MONSTERS);
    if (nftCounts.money_monsters3d.size > 0) newRoles.add(ROLES.MONEY_MONSTERS_3D);
    if (nftCounts.ai_bitbots.size > 0) newRoles.add(ROLES.AI_BITBOTS);
    if (nftCounts.warriors.size > 0) newRoles.add(ROLES.WARRIORS);
    if (nftCounts.squirrels.size > 0) newRoles.add(ROLES.SQUIRRELS);
    if (nftCounts.rjctd_bots.size > 0) newRoles.add(ROLES.RJCTD_BOTS);
    if (nftCounts.energy_apes.size > 0) newRoles.add(ROLES.ENERGY_APES);
    if (nftCounts.doodle_bots.size > 0) newRoles.add(ROLES.DOODLE_BOTS);
    if (nftCounts.candy_bots.size > 0) newRoles.add(ROLES.CANDY_BOTS);

    // Update roles if they've changed
    if (!setsAreEqual(currentRoles, newRoles)) {
      await member.roles.set(Array.from(newRoles));
      console.log('Updated roles for user:', userId);
      return true;
    }

    console.log('No role updates needed for user:', userId);
    return false;
  } catch (error) {
    console.error('Error updating Discord roles:', error);
    throw error;
  }
}
