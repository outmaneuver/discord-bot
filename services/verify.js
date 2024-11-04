import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { redis } from '../config/redis.js';
import { calculateDailyReward } from './rewards.js';

const BUX_TOKEN_MINT = 'FMiRxSbLqRTWiBszt1DZmXd7SrscWCccY7fcXNtwWxHK';
const LIQUIDITY_WALLET = 'BXQdPJNGXkDdQEgM6gMAxNu9YLhZJfBc9Y3qdJgpJ1Lw';
const EXEMPT_WALLETS = [
    'BXQdPJNGXkDdQEgM6gMAxNu9YLhZJfBc9Y3qdJgpJ1Lw', // Liquidity wallet
    'FMiRxSbLqRTWiBszt1DZmXd7SrscWCccY7fcXNtwWxHK'  // Token mint
];

// Hashlists for NFT verification
let hashlists = {
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

// Add cache for NFT counts and BUX balance
const userDataCache = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute

// Simple function to verify NFTs from hashlists
async function verifyWallet(userId, walletAddress) {
    try {
        // Add input validation
        if (!userId || !walletAddress) {
            throw new Error('Invalid input parameters');
        }

        console.log(`Checking wallet ${walletAddress} for user ${userId}`);
        
        // Get BUX balance with retries
        const buxBalance = await getBUXBalance(walletAddress);
        console.log(`BUX balance for ${walletAddress}:`, buxBalance);

        // Initialize NFT counts
        const nftCounts = {
            fcked_catz: 0,
            celebcatz: 0,
            money_monsters: 0,
            money_monsters3d: 0,
            ai_bitbots: 0,
            warriors: 0,
            squirrels: 0,
            rjctd_bots: 0,
            energy_apes: 0,
            doodle_bots: 0,
            candy_bots: 0
        };

        // Get NFT token accounts with retries
        const maxRetries = 5;
        let attempt = 0;
        let tokenAccounts;

        while (attempt < maxRetries) {
            try {
                const connection = new Connection(process.env.SOLANA_RPC_URL);
                tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                    new PublicKey(walletAddress),
                    { programId: TOKEN_PROGRAM_ID }
                );
                break;
            } catch (error) {
                attempt++;
                if (error.message.includes('429') && attempt < maxRetries) {
                    const delay = 2000; // Simple 2 second delay between retries
                    console.log(`Rate limited getting NFTs for ${walletAddress}, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw error;
            }
        }

        if (!tokenAccounts) {
            throw new Error('Failed to get token accounts after retries');
        }

        // Check each token's mint address against hashlists
        for (const account of tokenAccounts.value) {
            const mint = account.account.data.parsed.info.mint;
            if (account.account.data.parsed.info.tokenAmount.amount === "1") {
                if (hashlists.fckedCatz.has(mint)) nftCounts.fcked_catz++;
                if (hashlists.celebCatz.has(mint)) nftCounts.celebcatz++;
                if (hashlists.moneyMonsters.has(mint)) nftCounts.money_monsters++;
                if (hashlists.moneyMonsters3d.has(mint)) nftCounts.money_monsters3d++;
                if (hashlists.aiBitbots.has(mint)) nftCounts.ai_bitbots++;
                if (hashlists.warriors.has(mint)) nftCounts.warriors++;
                if (hashlists.squirrels.has(mint)) nftCounts.squirrels++;
                if (hashlists.rjctdBots.has(mint)) nftCounts.rjctd_bots++;
                if (hashlists.energyApes.has(mint)) nftCounts.energy_apes++;
                if (hashlists.doodleBots.has(mint)) nftCounts.doodle_bots++;
                if (hashlists.candyBots.has(mint)) nftCounts.candy_bots++;
            }
        }

        return {
            success: true,
            data: {
                nftCounts,
                buxBalance: buxBalance
            }
        };

    } catch (error) {
        console.error('Error in verifyWallet:', error);
        throw error;
    }
}

// Get BUX balance with retries but no caching
async function getBUXBalance(walletAddress) {
    const connection = new Connection(process.env.SOLANA_RPC_URL);
    const maxRetries = 5;
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                new PublicKey(walletAddress),
                { mint: new PublicKey(BUX_TOKEN_MINT) }
            );

            const buxAccount = tokenAccounts.value.find(account => 
                account.account.data.parsed.info.mint === BUX_TOKEN_MINT
            );

            return buxAccount ? parseInt(buxAccount.account.data.parsed.info.tokenAmount.amount) : 0;

        } catch (error) {
            attempt++;
            
            // Only retry on rate limit errors
            if (error.message.includes('429') && attempt < maxRetries) {
                const delay = 2000; // Simple 2 second delay between retries
                console.log(`Rate limited getting balance for ${walletAddress}, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
    
    throw new Error(`Failed to get BUX balance after ${maxRetries} attempts`);
}

// Store wallet address with validation
async function storeWalletAddress(userId, walletAddress) {
    try {
        // Validate wallet address
        try {
            new PublicKey(walletAddress);
        } catch (error) {
            throw new Error('Invalid wallet address');
        }

        await redis.sadd(`wallets:${userId}`, walletAddress);
        return { success: true };
    } catch (error) {
        console.error('Error storing wallet:', error);
        throw error;
    }
}

// Update hashlists
function updateHashlists(newHashlists) {
    hashlists = {
        fckedCatz: new Set(newHashlists.fckedCatz),
        celebCatz: new Set(newHashlists.celebCatz),
        moneyMonsters: new Set(newHashlists.moneyMonsters),
        moneyMonsters3d: new Set(newHashlists.moneyMonsters3d),
        aiBitbots: new Set(newHashlists.aiBitbots),
        warriors: new Set(newHashlists.warriors),
        squirrels: new Set(newHashlists.squirrels),
        rjctdBots: new Set(newHashlists.rjctdBots),
        energyApes: new Set(newHashlists.energyApes),
        doodleBots: new Set(newHashlists.doodleBots),
        candyBots: new Set(newHashlists.candyBots),
        mmTop10: new Set(newHashlists.mmTop10),
        mm3dTop10: new Set(newHashlists.mm3dTop10)
    };
}

// Add updateDiscordRoles function back
async function updateDiscordRoles(userId, client) {
    try {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        const member = await guild.members.fetch(userId);
        
        console.log(`Starting role update for ${member.user.username}`);

        // Get wallet data first
        const wallets = await redis.smembers(`wallets:${userId}`);
        if (!wallets.length) {
            console.log('No wallets found for user');
            return { success: false, error: 'No wallets found' };
        }

        let totalBuxBalance = 0;
        let nftCounts = {
            fcked_catz: 0,
            celebcatz: 0,
            money_monsters: 0,
            money_monsters3d: 0,
            ai_bitbots: 0,
            warriors: 0,
            squirrels: 0,
            rjctd_bots: 0,
            energy_apes: 0,
            doodle_bots: 0,
            candy_bots: 0
        };

        // Get data from all wallets
        for (const wallet of wallets) {
            console.log(`Checking wallet ${wallet}`);
            const result = await verifyWallet(userId, wallet);
            
            if (result.success) {
                totalBuxBalance += result.data.buxBalance / 1e9;
                for (const [collection, count] of Object.entries(result.data.nftCounts)) {
                    nftCounts[collection] += count;
                }
            }
        }

        console.log('NFT counts:', nftCounts);
        console.log('Total BUX balance:', totalBuxBalance);

        // Determine roles - only add roles that exist in env vars
        const rolesToAdd = [];
        
        // NFT roles
        if (nftCounts.fcked_catz > 0 && process.env.ROLE_ID_FCKED_CATZ) 
            rolesToAdd.push(process.env.ROLE_ID_FCKED_CATZ);
        if (nftCounts.celebcatz > 0 && process.env.ROLE_ID_CELEB_CATZ) 
            rolesToAdd.push(process.env.ROLE_ID_CELEB_CATZ);
        if (nftCounts.money_monsters > 0 && process.env.ROLE_ID_MONEY_MONSTERS) 
            rolesToAdd.push(process.env.ROLE_ID_MONEY_MONSTERS);
        if (nftCounts.money_monsters3d > 0 && process.env.ROLE_ID_MONEY_MONSTERS3D) 
            rolesToAdd.push(process.env.ROLE_ID_MONEY_MONSTERS3D);
        if (nftCounts.ai_bitbots > 0 && process.env.ROLE_ID_AI_BITBOTS) 
            rolesToAdd.push(process.env.ROLE_ID_AI_BITBOTS);
        if (nftCounts.warriors > 0 && process.env.ROLE_ID_WARRIORS) 
            rolesToAdd.push(process.env.ROLE_ID_WARRIORS);
        if (nftCounts.squirrels > 0 && process.env.ROLE_ID_SQUIRRELS) 
            rolesToAdd.push(process.env.ROLE_ID_SQUIRRELS);
        if (nftCounts.rjctd_bots > 0 && process.env.ROLE_ID_RJCTD_BOTS) 
            rolesToAdd.push(process.env.ROLE_ID_RJCTD_BOTS);
        if (nftCounts.energy_apes > 0 && process.env.ROLE_ID_ENERGY_APES) 
            rolesToAdd.push(process.env.ROLE_ID_ENERGY_APES);
        if (nftCounts.doodle_bots > 0 && process.env.ROLE_ID_DOODLE_BOTS) 
            rolesToAdd.push(process.env.ROLE_ID_DOODLE_BOTS);
        if (nftCounts.candy_bots > 0 && process.env.ROLE_ID_CANDY_BOTS) 
            rolesToAdd.push(process.env.ROLE_ID_CANDY_BOTS);

        // BUX roles
        if (totalBuxBalance >= 50000 && process.env.ROLE_ID_50000_BUX) 
            rolesToAdd.push(process.env.ROLE_ID_50000_BUX);
        if (totalBuxBalance >= 25000 && process.env.ROLE_ID_25000_BUX) 
            rolesToAdd.push(process.env.ROLE_ID_25000_BUX);
        if (totalBuxBalance >= 10000 && process.env.ROLE_ID_10000_BUX) 
            rolesToAdd.push(process.env.ROLE_ID_10000_BUX);
        if (totalBuxBalance >= 2500 && process.env.ROLE_ID_2500_BUX) 
            rolesToAdd.push(process.env.ROLE_ID_2500_BUX);

        // Whale roles
        if (nftCounts.fcked_catz >= 25 && process.env.WHALE_ROLE_ID_FCKED_CATZ) 
            rolesToAdd.push(process.env.WHALE_ROLE_ID_FCKED_CATZ);
        if (nftCounts.money_monsters >= 25 && process.env.WHALE_ROLE_ID_MONEY_MONSTERS) 
            rolesToAdd.push(process.env.WHALE_ROLE_ID_MONEY_MONSTERS);
        if (nftCounts.money_monsters3d >= 25 && process.env.WHALE_ROLE_ID_MONEY_MONSTERS3D) 
            rolesToAdd.push(process.env.WHALE_ROLE_ID_MONEY_MONSTERS3D);
        if (nftCounts.ai_bitbots >= 25 && process.env.WHALE_ROLE_ID_AI_BITBOTS) 
            rolesToAdd.push(process.env.WHALE_ROLE_ID_AI_BITBOTS);

        // Get current roles
        const currentRoles = member.roles.cache
            .filter(role => role.id !== guild.id)
            .map(role => role.id);

        // Get all possible NFT/BUX role IDs from env
        const allPossibleRoles = Object.entries(process.env)
            .filter(([key, value]) => key.includes('ROLE_ID') && value)
            .map(([_, value]) => value);

        // Only remove roles that are NFT/BUX related and not in rolesToAdd
        const rolesToRemove = currentRoles.filter(roleId => 
            !rolesToAdd.includes(roleId) && 
            allPossibleRoles.includes(roleId)
        );

        console.log('Roles to add:', rolesToAdd);
        console.log('Roles to remove:', rolesToRemove);

        // Update roles
        if (rolesToRemove.length > 0) {
            await member.roles.remove(rolesToRemove);
            console.log('Removed roles:', rolesToRemove);
        }

        if (rolesToAdd.length > 0) {
            await member.roles.add(rolesToAdd);
            console.log('Added roles:', rolesToAdd);
        }

        return { success: true };
    } catch (error) {
        console.error('Error updating roles:', error);
        throw error;
    }
}

// Add this function to services/verify.js
async function getBUXValue() {
    // Get SOL price
    const solPriceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const solPriceData = await solPriceRes.json();
    const solPrice = solPriceData.solana.usd;

    // Get liquidity wallet SOL balance
    const connection = new Connection(process.env.SOLANA_RPC_URL);
    const liquidityBalance = await connection.getBalance(new PublicKey(LIQUIDITY_WALLET));
    const liquiditySol = (liquidityBalance / 1e9) + 17.75567;

    // Get total supply and exempt balances
    const tokenSupply = await connection.getTokenSupply(new PublicKey(BUX_TOKEN_MINT));
    const totalSupply = tokenSupply.value.uiAmount;

    let exemptBalance = 0;
    for (const wallet of EXEMPT_WALLETS) {
        try {
            const balance = await getBUXBalance(wallet);
            exemptBalance += balance;
        } catch (error) {
            console.error(`Error getting exempt wallet balance: ${error}`);
            throw error;
        }
    }

    const publicSupply = totalSupply - exemptBalance;
    const buxValueSol = liquiditySol / publicSupply;
    const buxValueUsd = buxValueSol * solPrice;

    return {
        solPrice,
        liquiditySol,
        totalSupply,
        exemptBalance,
        publicSupply,
        buxValueSol,
        buxValueUsd
    };
}

export {
    verifyWallet,
    hashlists,
    updateHashlists,
    getBUXBalance,
    storeWalletAddress,
    updateDiscordRoles,
    getBUXValue,
    LIQUIDITY_WALLET,
    BUX_TOKEN_MINT,
    EXEMPT_WALLETS
};
