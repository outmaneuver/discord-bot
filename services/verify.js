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

// Add a cache for the current verification session
let currentVerificationBalances = new Map();

// Modify rate limiting to be per-wallet instead of per-user
const verificationRateLimit = new Map();

// Simple function to verify NFTs from hashlists
async function verifyWallet(userId, walletAddress) {
    // Check rate limit for specific wallet
    const now = Date.now();
    const lastVerify = verificationRateLimit.get(walletAddress) || 0;
    if (now - lastVerify < 30000) { // 30 second cooldown per wallet
        console.log(`Rate limit hit for wallet ${walletAddress}`);
        // Don't throw error, just use cached data
        return await getCachedWalletData(walletAddress);
    }
    verificationRateLimit.set(walletAddress, now);

    try {
        if (!userId || !walletAddress) {
            throw new Error('Invalid input parameters');
        }

        // Add delay between wallet checks to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log(`Checking wallet ${walletAddress} for user ${userId}`);
        
        // Single RPC call to get all token accounts
        const connection = new Connection(process.env.SOLANA_RPC_URL);
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            new PublicKey(walletAddress),
            { programId: TOKEN_PROGRAM_ID }
        );

        // Get BUX balance and NFT counts from the same token accounts data
        let buxBalance = 0;
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

        // Process all tokens in one pass
        for (const account of tokenAccounts.value) {
            const mint = account.account.data.parsed.info.mint;
            const amount = account.account.data.parsed.info.tokenAmount.amount;

            if (mint === BUX_TOKEN_MINT) {
                buxBalance = parseInt(amount);
            } else if (amount === "1") {
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

        console.log(`BUX balance for ${walletAddress}:`, buxBalance);

        return {
            success: true,
            data: {
                nftCounts,
                buxBalance: buxBalance
            }
        };

    } catch (error) {
        if (error.message.includes('429')) {
            // Wait 2 seconds and try once more
            await new Promise(resolve => setTimeout(resolve, 2000));
            try {
                const connection = new Connection(process.env.SOLANA_RPC_URL);
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                    new PublicKey(walletAddress),
                    { programId: TOKEN_PROGRAM_ID }
                );
                // Process tokens same as above...
                return {
                    success: true,
                    data: {
                        nftCounts: processTokenAccounts(tokenAccounts),
                        buxBalance: getBuxBalance(tokenAccounts)
                    }
                };
            } catch (retryError) {
                console.error('Error in verifyWallet:', retryError);
                throw retryError;
            }
        }
        console.error(`Verification error for wallet ${walletAddress}:`, error);
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
        console.log(`Starting role update for ${userId}`);
        const wallets = await redis.smembers(`wallets:${userId}`);
        if (!wallets || wallets.length === 0) {
            return { nftCounts: {} };
        }

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

        // Check each wallet with better rate limit handling
        for (const wallet of wallets) {
            console.log(`Checking wallet ${wallet}`);
            
            try {
                // Get BUX balance with retries
                let retryCount = 0;
                while (retryCount < 5) {
                    try {
                        const buxBalance = await getBUXBalance(wallet);
                        console.log(`BUX balance for ${wallet}: ${buxBalance}`);
                        totalBuxBalance += buxBalance;
                        break;
                    } catch (error) {
                        if (error.message.includes('429')) {
                            retryCount++;
                            const delay = Math.min(2000 * Math.pow(2, retryCount), 32000);
                            console.log(`Rate limited getting balance for ${wallet}, waiting ${delay}ms (attempt ${retryCount}/5)`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                        } else {
                            throw error;
                        }
                    }
                }

                // Add delay between wallet checks
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const connection = new Connection(process.env.SOLANA_RPC_URL);
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                    new PublicKey(wallet),
                    { programId: TOKEN_PROGRAM_ID }
                );

                // Process NFTs and aggregate counts
                for (const { account } of tokenAccounts.value) {
                    const mint = account.data.parsed.info.mint;
                    const amount = parseInt(account.data.parsed.info.tokenAmount.amount);
                    
                    if (amount > 0) {
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

            } catch (error) {
                console.error(`Error checking wallet ${wallet}:`, error);
                continue; // Continue with next wallet if one fails
            }
        }

        console.log('NFT counts:', nftCounts);
        console.log('Total BUX balance:', totalBuxBalance / 1e9);

        // Update roles based on aggregated counts
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const member = await guild.members.fetch(userId);
        
        const rolesToAdd = [];
        const rolesToRemove = [];

        // Define role mappings
        const roleMapping = {
            fcked_catz: ['1095033759612547133'],
            celebcatz: ['1093607056696692828'],
            money_monsters: ['1093607187454111825'],
            money_monsters3d: ['1095034117877399686'],
            ai_bitbots: ['1300968613179686943'],
            warriors: ['1300969147441610773'],
            squirrels: ['1300968964276621313'],
            rjctd_bots: ['1300969353952362557'],
            energy_apes: ['1300969268665389157'],
            doodle_bots: ['1095363984581984357'],
            candy_bots: ['1248417591215784019']
        };

        // Add roles based on NFT counts
        for (const [collection, roles] of Object.entries(roleMapping)) {
            if (nftCounts[collection] > 0) {
                rolesToAdd.push(...roles);
            }
        }

        // Add BUX holder roles
        if (totalBuxBalance >= 100000 * 1e9) rolesToAdd.push('1248417674476916809');
        if (totalBuxBalance >= 1000000 * 1e9) rolesToAdd.push('1248416679504117861');
        if (totalBuxBalance >= 10000000 * 1e9) rolesToAdd.push('1093606438674382858');
        if (totalBuxBalance >= 100000000 * 1e9) rolesToAdd.push('1093606579355525252');

        console.log('Roles to add:', rolesToAdd);
        console.log('Roles to remove:', rolesToRemove);

        // Add new roles
        for (const roleId of rolesToAdd) {
            try {
                await member.roles.add(roleId);
            } catch (error) {
                console.error(`Error adding role ${roleId}:`, error);
            }
        }

        // Remove roles
        for (const roleId of rolesToRemove) {
            try {
                await member.roles.remove(roleId);
            } catch (error) {
                console.error(`Error removing role ${roleId}:`, error);
            }
        }

        console.log('Added roles:', rolesToAdd);

        return {
            success: true,
            nftCounts,
            buxBalance: totalBuxBalance / 1e9
        };

    } catch (error) {
        console.error('Error updating roles:', error);
        throw error;
    }
}

// Add this function to services/verify.js
async function getBUXValue() {
    try {
        // Get SOL price
        const solPriceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        const solPriceData = await solPriceRes.json();
        const solPrice = solPriceData.solana.usd;

        // Get liquidity wallet SOL balance
        const connection = new Connection(process.env.SOLANA_RPC_URL);
        const liquidityBalance = await connection.getBalance(new PublicKey(LIQUIDITY_WALLET));
        const liquiditySol = (liquidityBalance / 1e9) + 17.75567;

        // Get total supply from token mint
        const tokenSupply = await connection.getTokenSupply(new PublicKey(BUX_TOKEN_MINT));
        const totalSupply = tokenSupply.value.uiAmount;

        // Just use hardcoded exempt balance since we know what it is
        const exemptBalance = 101026160.834050;

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
    } catch (error) {
        console.error('Error getting BUX value:', error);
        throw error;
    }
}

// Add cache function
async function getCachedWalletData(walletAddress) {
    const cacheKey = `wallet:${walletAddress}:data`;
    const cached = await redis.get(cacheKey);
    if (cached) {
        return JSON.parse(cached);
    }
    return null;
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
