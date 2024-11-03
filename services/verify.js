import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { redis } from '../config/redis.js';
import { calculateDailyReward } from './rewards.js';

// Add constants at the top of the file
const ALL_NFT_ROLES = [
    'FCKED CATZ HOLDER',
    'CELEB CATZ HOLDER',
    'MONEY MONSTERS HOLDER',
    'MONEY MONSTERS 3D HOLDER',
    'AI BITBOTS HOLDER',
    'WARRIORS HOLDER',
    'SQUIRRELS HOLDER',
    'RJCTD BOTS HOLDER',
    'ENERGY APES HOLDER',
    'DOODLE BOTS HOLDER',
    'CANDY BOTS HOLDER'
];

const BUX_ROLES = {
    [process.env.ROLE_ID_2500_BUX]: 2500,
    [process.env.ROLE_ID_10000_BUX]: 10000,
    [process.env.ROLE_ID_25000_BUX]: 25000,
    [process.env.ROLE_ID_50000_BUX]: 50000
};

// Add rate limiting constants
const RATE_LIMIT_DELAY = 1000; // 1 second between RPC calls
const WALLET_CACHE_TTL = 300; // 5 minutes cache TTL
const MAX_RETRIES = 5;
const MAX_BACKOFF = 8000; // 8 seconds max delay

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
    candyBots: new Set()
};

const BUX_TOKEN_MINT = 'FMiRxSbLqRTWiBszt1DZmXd7SrscWCccY7fcXNtwWxHK';

// Add rate limiting with exponential backoff
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Update RPC endpoints with API keys and better error handling
const RPC_ENDPOINTS = [
    {
        url: process.env.SOLANA_RPC_URL,
        weight: 10,
        headers: process.env.SOLANA_RPC_API_KEY ? {
            'x-api-key': process.env.SOLANA_RPC_API_KEY
        } : undefined
    },
    {
        url: 'https://api.mainnet-beta.solana.com',
        weight: 5
    },
    {
        url: 'https://solana-api.projectserum.com',
        weight: 3
    }
].filter(endpoint => endpoint.url); // Remove any undefined endpoints

let currentRpcIndex = 0;
const RPC_TIMEOUT = 10000; // 10 second timeout

// Add connection pool and caching
const CONNECTION_POOL = [];
const MAX_POOL_SIZE = 3;

// Initialize connection pool
for (let i = 0; i < MAX_POOL_SIZE; i++) {
    CONNECTION_POOL.push(new Connection(process.env.SOLANA_RPC_URL));
}

// Get connection from pool
function getConnection() {
    return CONNECTION_POOL[Math.floor(Math.random() * CONNECTION_POOL.length)];
}

// Add cache management constants
const CACHE_KEYS = {
    WALLET: 'wallet:',
    BUX_BALANCE: 'bux:',
    NFT_ACCOUNTS: 'nft:',
    DAILY_REWARD: 'daily_reward:'
};

// Single CACHE_TTL object with all TTL values
const CACHE_TTL = {
    WALLET: 60,        // 1 minute for full wallet data
    BUX_BALANCE: 30,   // 30 seconds for BUX balance
    NFT_ACCOUNTS: 45,  // 45 seconds for NFT data
    DAILY_REWARD: 300  // 5 minutes for daily reward calculation
};

// Update verifyWallet to always check BUX balance
async function verifyWallet(userId, walletAddress) {
    try {
        console.log(`Checking wallet ${walletAddress} for user ${userId}`);
        
        // Always get fresh BUX balance
        const buxBalance = await getBUXBalance(walletAddress);
        console.log(`BUX balance for ${walletAddress}:`, buxBalance);

        // Check NFT cache with shorter TTL
        const nftCacheKey = `${CACHE_KEYS.NFT_ACCOUNTS}${walletAddress}`;
        let nftAccounts = null;
        const cachedNFTs = await redis.get(nftCacheKey);

        if (cachedNFTs) {
            console.log('Using cached NFT data');
            nftAccounts = JSON.parse(cachedNFTs);
        } else {
            // Get fresh NFT data if not cached
            const connection = getConnection();
            nftAccounts = await getNFTAccounts(walletAddress, connection);
            
            // Cache NFT data with shorter TTL
            if (nftAccounts?.value) {
                await redis.setex(nftCacheKey, CACHE_TTL.NFT_ACCOUNTS, JSON.stringify(nftAccounts));
            }
        }

        // Process NFT counts
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

        if (nftAccounts?.value) {
            for (const account of nftAccounts.value) {
                const mint = account.account.data.parsed.info.mint;
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

        // Get daily reward from cache or calculate
        const rewardCacheKey = `${CACHE_KEYS.DAILY_REWARD}${walletAddress}`;
        let dailyReward = await redis.get(rewardCacheKey);

        if (!dailyReward) {
            dailyReward = await calculateDailyReward(nftCounts);
            await redis.setex(rewardCacheKey, CACHE_TTL.DAILY_REWARD, dailyReward.toString());
        }

        const result = {
            success: true,
            data: {
                nftCounts,
                buxBalance,
                dailyReward: parseInt(dailyReward)
            }
        };

        return result;

    } catch (error) {
        console.error('Error in verifyWallet:', error);
        throw error;
    }
}

// Add helper functions for cached data retrieval
async function getCachedBuxBalance(walletAddress) {
    const cacheKey = `${CACHE_KEYS.BUX_BALANCE}${walletAddress}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
        return parseFloat(cached);
    }

    const balance = await getBUXBalance(walletAddress);
    await redis.setex(cacheKey, CACHE_TTL.BUX_BALANCE, balance.toString());
    return balance;
}

async function getCachedNFTAccounts(walletAddress) {
    const cacheKey = `${CACHE_KEYS.NFT_ACCOUNTS}${walletAddress}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
        return JSON.parse(cached);
    }

    const connection = getConnection();
    const accounts = await getNFTAccounts(walletAddress, connection);
    await redis.setex(cacheKey, CACHE_TTL.NFT_ACCOUNTS, JSON.stringify(accounts));
    return accounts;
}

// Add separate function for NFT account fetching with retries
async function getNFTAccounts(walletAddress, connection) {
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
        try {
            return await Promise.race([
                connection.getParsedTokenAccountsByOwner(
                    new PublicKey(walletAddress),
                    { programId: TOKEN_PROGRAM_ID }
                ),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('RPC Timeout')), 8000)
                )
            ]);
        } catch (error) {
            retries++;
            console.log(`RPC error (attempt ${retries}/${maxRetries}):`, error.message);
            
            if (retries === maxRetries) {
                console.log('Max retries reached, returning empty result');
                return { value: [] };
            }
            
            await sleep(Math.min(1000 * Math.pow(2, retries), 4000));
        }
    }
}

// Update updateDiscordRoles to avoid double counting
async function updateDiscordRoles(userId, client) {
    try {
        console.log('Starting role update for user:', userId);
        
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) throw new Error('Guild not found');

        const member = await guild.members.fetch(userId);
        if (!member) throw new Error('Member not found');

        // Get all wallets
        const wallets = await redis.smembers(`wallets:${userId}`);
        console.log('Found wallets:', wallets);

        // Create a Set to track unique NFT mints
        const uniqueMints = {
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

        let totalBuxBalance = 0;

        // Process wallets with rate limiting
        for (const wallet of wallets) {
            try {
                const result = await verifyWallet(userId, wallet);
                if (result.success && result.data.nftAccounts?.value) {
                    // Add unique mints to sets
                    for (const account of result.data.nftAccounts.value) {
                        const mint = account.account.data.parsed.info.mint;
                        if (hashlists.fckedCatz.has(mint)) uniqueMints.fcked_catz.add(mint);
                        if (hashlists.celebCatz.has(mint)) uniqueMints.celebcatz.add(mint);
                        if (hashlists.moneyMonsters.has(mint)) uniqueMints.money_monsters.add(mint);
                        if (hashlists.moneyMonsters3d.has(mint)) uniqueMints.money_monsters3d.add(mint);
                        if (hashlists.aiBitbots.has(mint)) uniqueMints.ai_bitbots.add(mint);
                        if (hashlists.warriors.has(mint)) uniqueMints.warriors.add(mint);
                        if (hashlists.squirrels.has(mint)) uniqueMints.squirrels.add(mint);
                        if (hashlists.rjctdBots.has(mint)) uniqueMints.rjctd_bots.add(mint);
                        if (hashlists.energyApes.has(mint)) uniqueMints.energy_apes.add(mint);
                        if (hashlists.doodleBots.has(mint)) uniqueMints.doodle_bots.add(mint);
                        if (hashlists.candyBots.has(mint)) uniqueMints.candy_bots.add(mint);
                    }
                    totalBuxBalance += result.data.buxBalance;
                }
                await sleep(1000); // Rate limit between wallets
            } catch (error) {
                console.error(`Error verifying wallet ${wallet}:`, error);
            }
        }

        // Convert Sets to counts
        const totalNftCounts = {
            fcked_catz: uniqueMints.fcked_catz.size,
            celebcatz: uniqueMints.celebcatz.size,
            money_monsters: uniqueMints.money_monsters.size,
            money_monsters3d: uniqueMints.money_monsters3d.size,
            ai_bitbots: uniqueMints.ai_bitbots.size,
            warriors: uniqueMints.warriors.size,
            squirrels: uniqueMints.squirrels.size,
            rjctd_bots: uniqueMints.rjctd_bots.size,
            energy_apes: uniqueMints.energy_apes.size,
            doodle_bots: uniqueMints.doodle_bots.size,
            candy_bots: uniqueMints.candy_bots.size
        };

        // Update roles using role IDs
        const rolesToAdd = [];

        // Add NFT roles based on unique NFTs
        if (uniqueMints.fcked_catz.size > 0) rolesToAdd.push(process.env.ROLE_ID_FCKED_CATZ);
        if (uniqueMints.celebcatz.size > 0) rolesToAdd.push(process.env.ROLE_ID_CELEBCATZ);
        if (uniqueMints.money_monsters.size > 0) rolesToAdd.push(process.env.ROLE_ID_MONEY_MONSTERS);
        if (uniqueMints.money_monsters3d.size > 0) rolesToAdd.push(process.env.ROLE_ID_MONEY_MONSTERS3D);
        if (uniqueMints.ai_bitbots.size > 0) rolesToAdd.push(process.env.ROLE_ID_AI_BITBOTS);
        if (uniqueMints.warriors.size > 0) rolesToAdd.push(process.env.ROLE_ID_WARRIORS);
        if (uniqueMints.squirrels.size > 0) rolesToAdd.push(process.env.ROLE_ID_SQUIRRELS);
        if (uniqueMints.rjctd_bots.size > 0) rolesToAdd.push(process.env.ROLE_ID_RJCTD_BOTS);
        if (uniqueMints.energy_apes.size > 0) rolesToAdd.push(process.env.ROLE_ID_ENERGY_APES);
        if (uniqueMints.doodle_bots.size > 0) rolesToAdd.push(process.env.ROLE_ID_DOODLE_BOTS);
        if (uniqueMints.candy_bots.size > 0) rolesToAdd.push(process.env.ROLE_ID_CANDY_BOTS);

        // Add BUX roles based on total balance
        if (totalBuxBalance >= 50000) rolesToAdd.push(process.env.ROLE_ID_50000_BUX);
        if (totalBuxBalance >= 25000) rolesToAdd.push(process.env.ROLE_ID_25000_BUX);
        if (totalBuxBalance >= 10000) rolesToAdd.push(process.env.ROLE_ID_10000_BUX);
        if (totalBuxBalance >= 2500) rolesToAdd.push(process.env.ROLE_ID_2500_BUX);

        // Add roles
        if (rolesToAdd.length > 0) {
            const roles = rolesToAdd
                .map(id => guild.roles.cache.get(id))
                .filter(r => r);
            
            if (roles.length > 0) {
                await member.roles.add(roles);
                console.log('Added roles:', roles.map(r => r.name));
            }
        }

        return {
            success: true,
            nftCounts: totalNftCounts,
            buxBalance: totalBuxBalance
        };

    } catch (error) {
        console.error('Error updating Discord roles:', error);
        throw error;
    }
}

function updateHashlists(newHashlists) {
    if (newHashlists.fckedCatz) hashlists.fckedCatz = new Set(newHashlists.fckedCatz);
    if (newHashlists.celebCatz) hashlists.celebCatz = new Set(newHashlists.celebCatz);
    if (newHashlists.moneyMonsters) hashlists.moneyMonsters = new Set(newHashlists.moneyMonsters);
    if (newHashlists.moneyMonsters3d) hashlists.moneyMonsters3d = new Set(newHashlists.moneyMonsters3d);
    if (newHashlists.aiBitbots) hashlists.aiBitbots = new Set(newHashlists.aiBitbots);
    if (newHashlists.warriors) hashlists.warriors = new Set(newHashlists.warriors);
    if (newHashlists.squirrels) hashlists.squirrels = new Set(newHashlists.squirrels);
    if (newHashlists.rjctdBots) hashlists.rjctdBots = new Set(newHashlists.rjctdBots);
    if (newHashlists.energyApes) hashlists.energyApes = new Set(newHashlists.energyApes);
    if (newHashlists.doodleBots) hashlists.doodleBots = new Set(newHashlists.doodleBots);
    if (newHashlists.candyBots) hashlists.candyBots = new Set(newHashlists.candyBots);
}

// Add back getBUXBalance function
async function getBUXBalance(walletAddress) {
    try {
        // Check cache first
        const cacheKey = `bux:${walletAddress}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
            return parseInt(cached);
        }

        const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
        const buxAccounts = await connection.getParsedTokenAccountsByOwner(
            new PublicKey(walletAddress),
            { mint: new PublicKey(BUX_TOKEN_MINT) }
        );

        let totalBalance = 0;
        for (const account of buxAccounts.value) {
            const tokenAmount = account.account.data.parsed.info.tokenAmount;
            if (tokenAmount.decimals === 9) {
                totalBalance += Number(tokenAmount.amount);
            }
        }

        // Cache the result for 5 minutes
        await redis.setex(cacheKey, 300, totalBalance.toString());
        
        return totalBalance / Math.pow(10, 9); // Convert to decimal
    } catch (error) {
        console.error('Error getting BUX balance:', error);
        return 0;
    }
}

// Add storeWalletAddress function
async function storeWalletAddress(userId, walletAddress, walletType) {
    try {
        await redis.sadd(`wallets:${userId}`, walletAddress);
        return {
            success: true,
            message: 'Wallet stored successfully'
        };
    } catch (error) {
        console.error('Error storing wallet:', error);
        throw error;
    }
}

export {
    verifyWallet,
    updateDiscordRoles,
    hashlists,
    updateHashlists,
    getBUXBalance,
    storeWalletAddress
};
