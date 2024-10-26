import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

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
        const publicKey = new PublicKey(walletAddress);
        const nftCounts = {
            fcked_catz: [],
            celebcatz: [],
            money_monsters: [],
            money_monsters3d: [],
            ai_bitbots: []
        };

        // Fetch NFTs owned by the wallet
        const nftAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
            programId: TOKEN_PROGRAM_ID
        });

        for (let account of nftAccounts.value) {
            const mint = account.account.data.parsed.info.mint;
            const tokenAmount = account.account.data.parsed.info.tokenAmount;

            if (tokenAmount.amount === '1' && tokenAmount.decimals === 0) {
                // Check which collection this NFT belongs to
                if (await isNFTFromCollection(mint, FCKED_CATZ_COLLECTION)) {
                    nftCounts.fcked_catz.push(mint);
                } else if (await isNFTFromCollection(mint, CELEBCATZ_COLLECTION)) {
                    nftCounts.celebcatz.push(mint);
                } else if (await isNFTFromCollection(mint, MONEY_MONSTERS_COLLECTION)) {
                    nftCounts.money_monsters.push(mint);
                } else if (await isNFTFromCollection(mint, MONEY_MONSTERS_3D_COLLECTION)) {
                    nftCounts.money_monsters3d.push(mint);
                } else if (await isNFTFromCollection(mint, AI_BITBOTS_COLLECTION)) {
                    nftCounts.ai_bitbots.push(mint);
                }
            }
        }

        return nftCounts;
    } catch (error) {
        console.error('Error checking NFT ownership:', error);
        throw error;
    }
}

async function isNFTFromCollection(mint, collectionAddress) {
    // This is a placeholder implementation. You'll need to replace this with the actual logic
    // to check if an NFT belongs to a specific collection.
    // This might involve checking the NFT's metadata or using a Metaplex method.
    
    // For now, we'll just return true if the mint is not null and the collectionAddress is defined
    return mint != null && collectionAddress != null;
}

export async function getBUXBalance(walletAddress) {
    try {
        const publicKey = new PublicKey(walletAddress);
        const buxMint = new PublicKey(BUX_TOKEN_MINT);

        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
            mint: buxMint
        });

        if (tokenAccounts.value.length > 0) {
            const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
            return balance;
        }

        return 0;
    } catch (error) {
        console.error('Error getting BUX balance:', error);
        throw error;
    }
}

export async function updateDiscordRoles(client, userId, nftCounts, buxBalance, walletAddress) {
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(userId);

        // Define your role IDs (you should add these to your .env file)
        const FCKED_CATZ_ROLE = process.env.FCKED_CATZ_ROLE_ID;
        const CELEBCATZ_ROLE = process.env.CELEBCATZ_ROLE_ID;
        const MONEY_MONSTERS_ROLE = process.env.MONEY_MONSTERS_ROLE_ID;
        const MONEY_MONSTERS_3D_ROLE = process.env.MONEY_MONSTERS_3D_ROLE_ID;
        const AI_BITBOTS_ROLE = process.env.AI_BITBOTS_ROLE_ID;
        const BUX_HOLDER_ROLE = process.env.BUX_HOLDER_ROLE_ID;

        // Update roles based on NFT ownership
        if (nftCounts.fcked_catz.length > 0) {
            await member.roles.add(FCKED_CATZ_ROLE);
        } else {
            await member.roles.remove(FCKED_CATZ_ROLE);
        }

        if (nftCounts.celebcatz.length > 0) {
            await member.roles.add(CELEBCATZ_ROLE);
        } else {
            await member.roles.remove(CELEBCATZ_ROLE);
        }

        if (nftCounts.money_monsters.length > 0) {
            await member.roles.add(MONEY_MONSTERS_ROLE);
        } else {
            await member.roles.remove(MONEY_MONSTERS_ROLE);
        }

        if (nftCounts.money_monsters3d.length > 0) {
            await member.roles.add(MONEY_MONSTERS_3D_ROLE);
        } else {
            await member.roles.remove(MONEY_MONSTERS_3D_ROLE);
        }

        if (nftCounts.ai_bitbots.length > 0) {
            await member.roles.add(AI_BITBOTS_ROLE);
        } else {
            await member.roles.remove(AI_BITBOTS_ROLE);
        }

        // Update BUX holder role
        if (buxBalance > 0) {
            await member.roles.add(BUX_HOLDER_ROLE);
        } else {
            await member.roles.remove(BUX_HOLDER_ROLE);
        }

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
