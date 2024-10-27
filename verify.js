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
const GUILD_ID = process.env.DISCORD_GUILD_ID;

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

// Rest of verify.js remains the same...
