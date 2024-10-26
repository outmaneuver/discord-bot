import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as borsh from 'borsh';

const GUILD_ID = process.env.GUILD_ID;
const BUX_TOKEN_MINT = process.env.BUX_TOKEN_MINT;

// Use the collection addresses from environment variables
const FCKED_CATZ_COLLECTION = process.env.COLLECTION_ADDRESS_FCKED_CATZ;
const CELEBCATZ_COLLECTION = process.env.COLLECTION_ADDRESS_CELEBCATZ;
const MONEY_MONSTERS_COLLECTION = process.env.COLLECTION_ADDRESS_MONEY_MONSTERS;
const MONEY_MONSTERS_3D_COLLECTION = process.env.COLLECTION_ADDRESS_MONEYMONSTERS3D;
const AI_BITBOTS_COLLECTION = process.env.COLLECTION_ADDRESS_AI_BITBOTS;

const connection = new Connection(process.env.SOLANA_RPC_URL);

export async function verifyHolder(client, userId, walletAddress) {
    // ... (existing verifyHolder function)
}

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
        const nftAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
            programId: TOKEN_PROGRAM_ID
        });
        console.log(`Found ${nftAccounts.value.length} token accounts`);

        for (let account of nftAccounts.value) {
            console.log('Processing account:', JSON.stringify(account, null, 2));
            const mint = account.account.data.parsed.info.mint;
            const tokenAmount = account.account.data.parsed.info.tokenAmount;

            if (tokenAmount.amount === '1' && tokenAmount.decimals === 0) {
                console.log(`Checking collection for NFT: ${mint}`);
                const collectionInfo = await getCollectionInfo(mint);
                if (collectionInfo) {
                    console.log(`NFT ${mint} belongs to collection ${collectionInfo.collectionAddress}`);
                    if (collectionInfo.collectionAddress === FCKED_CATZ_COLLECTION) {
                        nftCounts.fcked_catz.push(mint);
                    } else if (collectionInfo.collectionAddress === CELEBCATZ_COLLECTION) {
                        nftCounts.celebcatz.push(mint);
                    } else if (collectionInfo.collectionAddress === MONEY_MONSTERS_COLLECTION) {
                        nftCounts.money_monsters.push(mint);
                    } else if (collectionInfo.collectionAddress === MONEY_MONSTERS_3D_COLLECTION) {
                        nftCounts.money_monsters3d.push(mint);
                    } else if (collectionInfo.collectionAddress === AI_BITBOTS_COLLECTION) {
                        nftCounts.ai_bitbots.push(mint);
                    }
                } else {
                    console.log(`NFT ${mint} does not belong to any known collection`);
                }
            }
        }

        console.log('NFT counts:', nftCounts);
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

        const accountInfo = await connection.getAccountInfo(metadataAccount);
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
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
            mint: buxMint
        });
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

export async function updateDiscordRoles(client, userId, nftCounts, buxBalance, walletAddress) {
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
      process.env.ROLE_ID_2500_BUX,
      process.env.ROLE_ID_10000_BUX,
      process.env.ROLE_ID_25000_BUX,
      process.env.ROLE_ID_50000_BUX
    ];

    // Remove all possible roles
    for (const roleId of allRoles) {
      if (roleId && member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
      }
    }

    // Add roles based on NFT ownership
    const rolesToAdd = [];

    if (nftCounts.fcked_catz && nftCounts.fcked_catz.length > 0) {
      rolesToAdd.push(process.env.ROLE_ID_FCKED_CATZ);
      if (nftCounts.fcked_catz.length >= parseInt(process.env.WHALE_THRESHOLD_FCKED_CATZ)) {
        rolesToAdd.push(process.env.WHALE_ROLE_ID_FCKED_CATZ);
      }
    }

    if (nftCounts.celebcatz && nftCounts.celebcatz.length > 0) {
      rolesToAdd.push(process.env.ROLE_ID_CELEBCATZ);
    }

    if (nftCounts.money_monsters && nftCounts.money_monsters.length > 0) {
      rolesToAdd.push(process.env.ROLE_ID_MONEY_MONSTERS);
      if (nftCounts.money_monsters.length >= parseInt(process.env.WHALE_THRESHOLD_MONEY_MONSTERS)) {
        rolesToAdd.push(process.env.WHALE_ROLE_ID_MONEY_MONSTERS);
      }
    }

    if (nftCounts.money_monsters3d && nftCounts.money_monsters3d.length > 0) {
      rolesToAdd.push(process.env.ROLE_ID_MONEY_MONSTERS3D);
      if (nftCounts.money_monsters3d.length >= parseInt(process.env.WHALE_THRESHOLD_MONEY_MONSTERS3D)) {
        rolesToAdd.push(process.env.WHALE_ROLE_ID_MONEY_MONSTERS3D);
      }
    }

    if (nftCounts.ai_bitbots && nftCounts.ai_bitbots.length > 0) {
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

    // Add the roles
    for (const roleId of rolesToAdd) {
      if (roleId && !member.roles.cache.has(roleId)) {
        await member.roles.add(roleId);
      }
    }

    console.log(`Updated roles for user ${userId}`);
    return true;
  } catch (error) {
    console.error('Error updating Discord roles:', error);
    return false;
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
