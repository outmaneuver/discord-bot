import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { redis } from '../config/redis.js';
import { calculateDailyReward } from './rewards.js';

const BUX_TOKEN_MINT = 'FMiRxSbLqRTWiBszt1DZmXd7SrscWCccY7fcXNtwWxHK';
const LIQUIDITY_WALLET = 'BXQdPJNGXkDdQEgM6gMAxNu9YLhZJfBc9Y3qdJgpJ1Lw';

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
        
        // Check cache first
        const cacheKey = `${userId}:${walletAddress}`;
        const cached = userDataCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
            return cached.data;
        }

        // Get BUX balance
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

        // Get NFT token accounts with single RPC call
        const connection = new Connection(process.env.SOLANA_RPC_URL);
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            new PublicKey(walletAddress),
            { programId: TOKEN_PROGRAM_ID }
        );

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

        const result = {
            success: true,
            data: {
                nftCounts,
                buxBalance: buxBalance * 1e9 // Convert to raw units
            }
        };

        // Cache the result
        userDataCache.set(cacheKey, {
            timestamp: Date.now(),
            data: result
        });

        return result;

    } catch (error) {
        console.error('Error in verifyWallet:', error);
        throw error;
    }
}

// Get BUX balance with retries but no caching
async function getBUXBalance(walletAddress) {
    try {
        const connection = new Connection(process.env.SOLANA_RPC_URL);
        const maxRetries = 5;
        let retryCount = 0;

        while (retryCount < maxRetries) {
            try {
                const buxAccounts = await connection.getParsedTokenAccountsByOwner(
                    new PublicKey(walletAddress),
                    { mint: new PublicKey(BUX_TOKEN_MINT) }
                );

                let totalBalance = 0;
                for (const account of buxAccounts.value) {
                    totalBalance += Number(account.account.data.parsed.info.tokenAmount.amount);
                }

                return totalBalance / Math.pow(10, 9);

            } catch (error) {
                retryCount++;

                // Only retry on rate limit errors
                if (!error.message.includes('429 Too Many Requests')) {
                    throw error;
                }

                // If we've used all retries, throw the error
                if (retryCount === maxRetries) {
                    throw new Error(`Failed to get balance after ${maxRetries} attempts: ${error.message}`);
                }

                // Exponential backoff with jitter
                const baseDelay = Math.min(1000 * Math.pow(2, retryCount), 8000);
                const jitter = Math.random() * 1000;
                const delay = baseDelay + jitter;
                
                console.log(`Rate limited getting balance for ${walletAddress}, retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

    } catch (error) {
        console.error(`Error getting BUX balance for ${walletAddress}:`, error);
        throw error; // Propagate error up instead of returning 0
    }
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
async function updateDiscordRoles(userId, client, existingData = null) {
    try {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        const member = await guild.members.fetch(userId);
        
        console.log(`Updating roles for ${member.user.username}`);

        // Get all NFT roles that can be assigned
        const allNftRoles = [
            process.env.ROLE_ID_FCKED_CATZ,
            process.env.ROLE_ID_CELEB_CATZ,
            process.env.ROLE_ID_MONEY_MONSTERS,
            process.env.ROLE_ID_MONEY_MONSTERS3D,
            process.env.ROLE_ID_AI_BITBOTS,
            process.env.ROLE_ID_WARRIORS,
            process.env.ROLE_ID_SQUIRRELS,
            process.env.ROLE_ID_RJCTD_BOTS,
            process.env.ROLE_ID_ENERGY_APES,
            process.env.ROLE_ID_DOODLE_BOTS,
            process.env.ROLE_ID_CANDY_BOTS,
            process.env.ROLE_ID_50000_BUX,
            process.env.ROLE_ID_25000_BUX,
            process.env.ROLE_ID_10000_BUX,
            process.env.ROLE_ID_2500_BUX,
            process.env.WHALE_ROLE_ID_FCKED_CATZ,
            process.env.WHALE_ROLE_ID_MONEY_MONSTERS,
            process.env.WHALE_ROLE_ID_MONEY_MONSTERS3D,
            process.env.WHALE_ROLE_ID_AI_BITBOTS,
            process.env.ROLE_ID_MM_TOP10,
            process.env.ROLE_ID_MM3D_TOP10
        ];

        // Get current roles that can be modified
        const currentRoles = member.roles.cache
            .filter(role => allNftRoles.includes(role.id))
            .map(role => role.id);

        console.log('Current NFT/BUX roles:', currentRoles);

        // Get wallet data
        const wallets = await redis.smembers(`wallets:${userId}`);
        let totalBuxBalance = 0;
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

        // Get NFT counts and BUX balance
        for (const wallet of wallets) {
            const result = await verifyWallet(userId, wallet);
            if (result.success) {
                totalBuxBalance += result.data.buxBalance / 1e9;
                for (const [collection, count] of Object.entries(result.data.nftCounts)) {
                    if (nftCounts[collection] !== undefined) {
                        nftCounts[collection] += count;
                    }
                }
            }
        }

        console.log('Total BUX balance:', totalBuxBalance);
        console.log('NFT counts:', nftCounts);

        // Determine which roles should be assigned
        const rolesToAdd = [];
        
        if (nftCounts.fcked_catz > 0) rolesToAdd.push(process.env.ROLE_ID_FCKED_CATZ);
        if (nftCounts.celebcatz > 0) rolesToAdd.push(process.env.ROLE_ID_CELEB_CATZ);
        if (nftCounts.money_monsters > 0) rolesToAdd.push(process.env.ROLE_ID_MONEY_MONSTERS);
        if (nftCounts.money_monsters3d > 0) rolesToAdd.push(process.env.ROLE_ID_MONEY_MONSTERS3D);
        if (nftCounts.ai_bitbots > 0) rolesToAdd.push(process.env.ROLE_ID_AI_BITBOTS);
        if (nftCounts.warriors > 0) rolesToAdd.push(process.env.ROLE_ID_WARRIORS);
        if (nftCounts.squirrels > 0) rolesToAdd.push(process.env.ROLE_ID_SQUIRRELS);
        if (nftCounts.rjctd_bots > 0) rolesToAdd.push(process.env.ROLE_ID_RJCTD_BOTS);
        if (nftCounts.energy_apes > 0) rolesToAdd.push(process.env.ROLE_ID_ENERGY_APES);
        if (nftCounts.doodle_bots > 0) rolesToAdd.push(process.env.ROLE_ID_DOODLE_BOTS);
        if (nftCounts.candy_bots > 0) rolesToAdd.push(process.env.ROLE_ID_CANDY_BOTS);

        // Add BUX roles based on total balance
        if (totalBuxBalance >= 50000) rolesToAdd.push(process.env.ROLE_ID_50000_BUX);
        if (totalBuxBalance >= 25000) rolesToAdd.push(process.env.ROLE_ID_25000_BUX);
        if (totalBuxBalance >= 10000) rolesToAdd.push(process.env.ROLE_ID_10000_BUX);
        if (totalBuxBalance >= 2500) rolesToAdd.push(process.env.ROLE_ID_2500_BUX);

        // Add whale roles
        if (nftCounts.fcked_catz >= parseInt(process.env.WHALE_THRESHOLD_FCKED_CATZ)) {
            rolesToAdd.push(process.env.WHALE_ROLE_ID_FCKED_CATZ);
        }
        if (nftCounts.money_monsters >= parseInt(process.env.WHALE_THRESHOLD_MONEY_MONSTERS)) {
            rolesToAdd.push(process.env.WHALE_ROLE_ID_MONEY_MONSTERS);
        }
        if (nftCounts.money_monsters3d >= parseInt(process.env.WHALE_THRESHOLD_MONEY_MONSTERS3D)) {
            rolesToAdd.push(process.env.WHALE_ROLE_ID_MONEY_MONSTERS3D);
        }
        if (nftCounts.ai_bitbots >= parseInt(process.env.WHALE_THRESHOLD_AI_BITBOTS)) {
            rolesToAdd.push(process.env.WHALE_ROLE_ID_AI_BITBOTS);
        }

        // Check for top 10 holders
        for (const wallet of wallets) {
            if (hashlists.mmTop10.has(wallet)) {
                rolesToAdd.push(process.env.ROLE_ID_MM_TOP10);
            }
            if (hashlists.mm3dTop10.has(wallet)) {
                rolesToAdd.push(process.env.ROLE_ID_MM3D_TOP10);
            }
        }

        console.log('Roles to add:', rolesToAdd);

        // Determine which roles should be removed
        const rolesToRemove = currentRoles.filter(roleId => !rolesToAdd.includes(roleId));
        console.log('Roles to remove:', rolesToRemove);

        // Remove roles that shouldn't be there
        if (rolesToRemove.length > 0) {
            const removeRoles = rolesToRemove
                .map(id => guild.roles.cache.get(id))
                .filter(r => r);
            
            if (removeRoles.length > 0) {
                await member.roles.remove(removeRoles);
                console.log('Removed roles:', removeRoles.map(r => r.name));
            }
        }

        // Add roles that should be there
        if (rolesToAdd.length > 0) {
            const addRoles = rolesToAdd
                .map(id => guild.roles.cache.get(id))
                .filter(r => r);
            
            if (addRoles.length > 0) {
                await member.roles.add(addRoles);
                console.log('Added roles:', addRoles.map(r => r.name));
            }
        }

        return {
            success: true,
            nftCounts,
            buxBalance: totalBuxBalance
        };

    } catch (error) {
        console.error('Error updating Discord roles:', error);
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
    getBUXValue
};
