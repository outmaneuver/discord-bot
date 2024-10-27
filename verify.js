import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as borsh from 'borsh';
import fs from 'fs/promises';
import path from 'path';
import Redis from 'ioredis';

const GUILD_ID = process.env.GUILD_ID;
const BUX_TOKEN_MINT = process.env.BUX_TOKEN_MINT;

// Use the collection addresses from environment variables
const FCKED_CATZ_COLLECTION = process.env.COLLECTION_ADDRESS_FCKED_CATZ;
const CELEBCATZ_COLLECTION = process.env.COLLECTION_ADDRESS_CELEBCATZ;
const MONEY_MONSTERS_COLLECTION = process.env.COLLECTION_ADDRESS_MONEY_MONSTERS;
const MONEY_MONSTERS_3D_COLLECTION = process.env.COLLECTION_ADDRESS_MONEYMONSTERS3D;
const AI_BITBOTS_COLLECTION = process.env.COLLECTION_ADDRESS_AI_BITBOTS;

const connection = new Connection(process.env.SOLANA_RPC_URL);

// Add this function for rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff(fn, maxRetries = 5, initialDelay = 1000) {
    let retries = 0;
    while (retries < maxRetries) {
        try {
            return await fn();
        } catch (error) {
            if (error.message.includes('429 Too Many Requests')) {
                const delay = initialDelay * Math.pow(2, retries);
                console.log(`Rate limited. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                retries++;
            } else {
                throw error;
            }
        }
    }
    throw new Error('Max retries reached');
}

// Load hashlists
const loadHashlist = async (filename) => {
  const filePath = path.join(process.cwd(), 'hashlists', filename);
  const data = await fs.readFile(filePath, 'utf8');
  return new Set(JSON.parse(data));
};

let fckedCatzHashlist, celebcatzHashlist, moneyMonstersHashlist, moneyMonsters3dHashlist, aiBitbotsHashlist;

const initializeHashlists = async () => {
  fckedCatzHashlist = await loadHashlist('fcked_catz.json');
  celebcatzHashlist = await loadHashlist('celebcatz.json');
  moneyMonstersHashlist = await loadHashlist('money_monsters.json');
  moneyMonsters3dHashlist = await loadHashlist('money_monsters3d.json');
  aiBitbotsHashlist = await loadHashlist('ai_bitbots.json');
};

// Call this function when your bot starts up
initializeHashlists();

const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  }
});

export async function verifyHolder(message) {
  try {
    console.log(`Verifying wallet: ${message.walletAddress}`);
    const nftCounts = await checkNFTOwnership(message.walletAddress);
    console.log('NFT ownership check complete:', nftCounts);

    const buxBalance = await getBUXBalance(message.walletAddress);
    console.log('BUX balance:', buxBalance);

    const rolesUpdated = await updateDiscordRoles(message.client, message.userId, nftCounts, buxBalance);

    // Calculate daily reward
    const dailyReward = calculateDailyReward(nftCounts, buxBalance);

    const formattedResponse = `Verification complete!\n\n**VERIFIED ASSETS:**\nFcked Catz - ${nftCounts.fcked_catz.length}\nCeleb Catz - ${nftCounts.celebcatz.length}\nMoney Monsters - ${nftCounts.money_monsters.length}\nMoney Monsters 3D - ${nftCounts.money_monsters3d.length}\nA.I. BitBots - ${nftCounts.ai_bitbots.length}\n$BUX - ${buxBalance}\n\n**Daily reward = ${dailyReward} $BUX**`;

    return {
      success: true,
      rolesUpdated,
      nftCounts,
      buxBalance,
      dailyReward,
      formattedResponse
    };
  } catch (error) {
    console.error('Error in verifyHolder:', error);
    return { success: false, error: error.message };
  }
}

function calculateDailyReward(nftCounts, buxBalance) {
  // Implement your daily reward calculation logic here
  // This is just a placeholder
  return (nftCounts.fcked_catz.length * 2) + 
         (nftCounts.money_monsters.length * 2) + 
         (nftCounts.ai_bitbots.length * 1) + 
         (nftCounts.money_monsters3d.length * 4) + 
         (nftCounts.celebcatz.length * 8);
}

async function storeWalletAddress(userId, walletAddress) {
  const key = `wallets:${userId}`;
  await redis.sadd(key, walletAddress);
}

async function getAllWallets(userId) {
  const key = `wallets:${userId}`;
  return await redis.smembers(key);
}

async function aggregateWalletData(wallets) {
  let aggregatedNftCounts = {
    fcked_catz: [],
    celebcatz: [],
    money_monsters: [],
    money_monsters3d: [],
    ai_bitbots: []
  };
  let totalBuxBalance = 0;

  for (const wallet of wallets) {
    const nftCounts = await checkNFTOwnership(wallet);
    const buxBalance = await getBUXBalance(wallet);

    // Aggregate NFT counts
    for (const [collection, nfts] of Object.entries(nftCounts)) {
      aggregatedNftCounts[collection] = [...aggregatedNftCounts[collection], ...nfts];
    }

    // Aggregate BUX balance
    totalBuxBalance += buxBalance;
  }

  return {
    nftCounts: aggregatedNftCounts,
    buxBalance: totalBuxBalance
  };
}

// Modify the checkNFTOwnership function
export async function checkNFTOwnership(walletAddress) {
    try {
        console.log(`Checking NFT ownership for wallet: ${walletAddress}`);
        const publicKey = new PublicKey(walletAddress);
        const nftCounts = {
            fcked_catz: [],
            celebcatz: [],
            money_monsters: [],
            money_monsters3d: [],
            ai_bitbots: []
        };

        console.log('Fetching NFT accounts...');
        const nftAccounts = await retryWithBackoff(() => 
            connection.getParsedTokenAccountsByOwner(publicKey, {
                programId: TOKEN_PROGRAM_ID
            })
        );
        console.log(`Found ${nftAccounts.value.length} token accounts`);

        for (let account of nftAccounts.value) {
            const mint = account.account.data.parsed.info.mint;
            const tokenAmount = account.account.data.parsed.info.tokenAmount;

            if (tokenAmount.amount === '1' && tokenAmount.decimals === 0) {
                if (fckedCatzHashlist.has(mint)) {
                    nftCounts.fcked_catz.push(mint);
                } else if (celebcatzHashlist.has(mint)) {
                    nftCounts.celebcatz.push(mint);
                } else if (moneyMonstersHashlist.has(mint)) {
                    nftCounts.money_monsters.push(mint);
                } else if (moneyMonsters3dHashlist.has(mint)) {
                    nftCounts.money_monsters3d.push(mint);
                } else if (aiBitbotsHashlist.has(mint)) {
                    nftCounts.ai_bitbots.push(mint);
                }
            }
        }

        console.log('NFT counts:', JSON.stringify(nftCounts, null, 2));
        return nftCounts;
    } catch (error) {
        console.error('Error checking NFT ownership:', error);
        throw error;
    }
}

async function getCollectionInfo(mint) {
    try {
        const metadataProgram = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
        const metadataAccount = PublicKey.findProgramAddressSync(
            [
                Buffer.from('metadata'),
                metadataProgram.toBuffer(),
                new PublicKey(mint).toBuffer(),
            ],
            metadataProgram
        )[0];

        const accountInfo = await retryWithBackoff(() => connection.getAccountInfo(metadataAccount));
        if (!accountInfo) {
            console.log(`No metadata account found for NFT ${mint}`);
            return null;
        }

        const metadata = decodeMetadata(accountInfo.data);
        console.log(`Metadata for NFT ${mint}:`, metadata);

        if (metadata.collection) {
            return {
                collectionAddress: metadata.collection.key.toBase58(),
                verified: metadata.collection.verified
            };
        }

        return null;
    } catch (error) {
        console.error(`Error getting collection info for NFT ${mint}:`, error);
        return null;
    }
}

function decodeMetadata(buffer) {
    // This is a simplified decoder. You might need a more comprehensive one depending on the metadata structure.
    const metadata = borsh.deserializeUnchecked(METADATA_SCHEMA, Metadata, buffer);
    return metadata;
}

// Move these class definitions before the METADATA_SCHEMA
class Metadata {
    constructor(args) {
        this.key = args.key;
        this.updateAuthority = args.updateAuthority;
        this.mint = args.mint;
        this.data = args.data;
        this.primarySaleHappened = args.primarySaleHappened;
        this.isMutable = args.isMutable;
        this.editionNonce = args.editionNonce;
        this.tokenStandard = args.tokenStandard;
        this.collection = args.collection;
        this.uses = args.uses;
    }
}

class Data {
    constructor(args) {
        this.name = args.name;
        this.symbol = args.symbol;
        this.uri = args.uri;
        this.sellerFeeBasisPoints = args.sellerFeeBasisPoints;
        this.creators = args.creators;
    }
}

class Creator {
    constructor(args) {
        this.address = args.address;
        this.verified = args.verified;
        this.share = args.share;
    }
}

class Collection {
    constructor(args) {
        this.verified = args.verified;
        this.key = args.key;
    }
}

class Uses {
    constructor(args) {
        this.useMethod = args.useMethod;
        this.remaining = args.remaining;
        this.total = args.total;
    }
}

const METADATA_SCHEMA = new Map([
    [
        Metadata,
        {
            kind: 'struct',
            fields: [
                ['key', 'u8'],
                ['updateAuthority', [32]],
                ['mint', [32]],
                ['data', Data],
                ['primarySaleHappened', 'u8'],
                ['isMutable', 'u8'],
                ['editionNonce', { kind: 'option', type: 'u8' }],
                ['tokenStandard', { kind: 'option', type: 'u8' }],
                ['collection', { kind: 'option', type: Collection }],
                ['uses', { kind: 'option', type: Uses }],
            ]
        }
    ],
    [
        Data,
        {
            kind: 'struct',
            fields: [
                ['name', 'string'],
                ['symbol', 'string'],
                ['uri', 'string'],
                ['sellerFeeBasisPoints', 'u16'],
                ['creators', { kind: 'option', type: [Creator] }]
            ]
        }
    ],
    [
        Creator,
        {
            kind: 'struct',
            fields: [
                ['address', [32]],
                ['verified', 'u8'],
                ['share', 'u8']
            ]
        }
    ],
    [
        Collection,
        {
            kind: 'struct',
            fields: [
                ['verified', 'u8'],
                ['key', [32]]
            ]
        }
    ],
    [
        Uses,
        {
            kind: 'struct',
            fields: [
                ['useMethod', 'u8'],
                ['remaining', 'u64'],
                ['total', 'u64']
            ]
        }
    ]
]);

export async function getBUXBalance(walletAddress) {
    try {
        console.log(`Getting BUX balance for wallet: ${walletAddress}`);
        const publicKey = new PublicKey(walletAddress);
        
        if (!BUX_TOKEN_MINT) {
            console.error('BUX_TOKEN_MINT is not defined in environment variables');
            return 0;
        }
        
        console.log(`BUX_TOKEN_MINT: ${BUX_TOKEN_MINT}`);
        const buxMint = new PublicKey(BUX_TOKEN_MINT);

        console.log('Fetching token accounts...');
        const tokenAccounts = await retryWithBackoff(() => 
            connection.getParsedTokenAccountsByOwner(publicKey, {
                mint: buxMint
            })
        );
        console.log(`Found ${tokenAccounts.value.length} BUX token accounts`);

        if (tokenAccounts.value.length > 0) {
            console.log('Token account data:', JSON.stringify(tokenAccounts.value[0], null, 2));
            const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
            console.log(`BUX balance: ${balance}`);
            return balance;
        }

        console.log('No BUX balance found');
        return 0;
    } catch (error) {
        console.error('Error getting BUX balance:', error);
        return 0;
    }
}

export async function updateDiscordRoles(client, userId, nftCounts, buxBalance) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const member = await guild.members.fetch(userId);

    // Define all possible roles
    const allRoles = [
      process.env.ROLE_ID_FCKED_CATZ,
      process.env.WHALE_ROLE_ID_FCKED_CATZ,
      process.env.ROLE_ID_CELEBCATZ,
      process.env.ROLE_ID_MONEY_MONSTERS,
      process.env.WHALE_ROLE_ID_MONEY_MONSTERS,
      process.env.ROLE_ID_MONEY_MONSTERS3D,
      process.env.ROLE_ID_MM_TOP10,
      process.env.ROLE_ID_MM3D_TOP10,
      process.env.WHALE_ROLE_ID_MONEY_MONSTERS3D,
      process.env.ROLE_ID_AI_BITBOTS,
      process.env.WHALE_ROLE_ID_AI_BITBOTS,
      process.env.ROLE_ID_50000_BUX,
      process.env.ROLE_ID_25000_BUX,
      process.env.ROLE_ID_10000_BUX,
      process.env.ROLE_ID_2500_BUX,
      process.env.ROLE_ID_VERIFIED
    ];

    // Array to store roles to be added
    const rolesToAdd = [];

    // Add verified role
    rolesToAdd.push(process.env.ROLE_ID_VERIFIED);

    // Check NFT counts and add roles
    if (nftCounts.fcked_catz.length > 0) {
      rolesToAdd.push(process.env.ROLE_ID_FCKED_CATZ);
      if (nftCounts.fcked_catz.length >= parseInt(process.env.WHALE_THRESHOLD_FCKED_CATZ)) {
        rolesToAdd.push(process.env.WHALE_ROLE_ID_FCKED_CATZ);
      }
    }

    if (nftCounts.celebcatz.length > 0) {
      rolesToAdd.push(process.env.ROLE_ID_CELEBCATZ);
    }

    if (nftCounts.money_monsters.length > 0) {
      rolesToAdd.push(process.env.ROLE_ID_MONEY_MONSTERS);
      if (nftCounts.money_monsters.length >= parseInt(process.env.WHALE_THRESHOLD_MONEY_MONSTERS)) {
        rolesToAdd.push(process.env.WHALE_ROLE_ID_MONEY_MONSTERS);
      }
    }

    if (nftCounts.money_monsters3d.length > 0) {
      rolesToAdd.push(process.env.ROLE_ID_MONEY_MONSTERS3D);
      if (nftCounts.money_monsters3d.length >= parseInt(process.env.WHALE_THRESHOLD_MONEY_MONSTERS3D)) {
        rolesToAdd.push(process.env.WHALE_ROLE_ID_MONEY_MONSTERS3D);
      }
    }

    if (nftCounts.ai_bitbots.length > 0) {
      rolesToAdd.push(process.env.ROLE_ID_AI_BITBOTS);
      if (nftCounts.ai_bitbots.length >= parseInt(process.env.WHALE_THRESHOLD_AI_BITBOTS)) {
        rolesToAdd.push(process.env.WHALE_ROLE_ID_AI_BITBOTS);
      }
    }

    // Add BUX balance roles
    if (buxBalance >= 50000) {
      rolesToAdd.push(process.env.ROLE_ID_50000_BUX);
    } else if (buxBalance >= 25000) {
      rolesToAdd.push(process.env.ROLE_ID_25000_BUX);
    } else if (buxBalance >= 10000) {
      rolesToAdd.push(process.env.ROLE_ID_10000_BUX);
    } else if (buxBalance >= 2500) {
      rolesToAdd.push(process.env.ROLE_ID_2500_BUX);
    }

    // Remove roles that are not in rolesToAdd
    for (const roleId of allRoles) {
      if (roleId && member.roles.cache.has(roleId) && !rolesToAdd.includes(roleId)) {
        await member.roles.remove(roleId);
      }
    }

    // Add the new roles
    for (const roleId of rolesToAdd) {
      if (roleId && !member.roles.cache.has(roleId)) {
        await member.roles.add(roleId);
      }
    }

    console.log(`Updated roles for user ${userId}:`, rolesToAdd);
    return true;
  } catch (error) {
    console.error('Error updating Discord roles:', error);
    throw error;
  }
}

export function sendVerificationMessage(channel) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('THANK YOU FOR CHOOSING BUXDAO')
        .setDescription('To verify your wallet, click the button and open the link in your browser on desktop or copy and paste into wallet browser on mobile devices\n\nAuthorise signing into your discord profile then connect your wallet\n\nYour server roles will update automatically based on your NFT and $BUX token holdings')
        .setTimestamp();

    const button = new ButtonBuilder()
        .setCustomId('verify_wallet')
        .setLabel('Verify Wallet')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder()
        .addComponents(button);

    return channel.send({ embeds: [embed], components: [row] });
}