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
const CACHE_TTL = 300; // 5 minutes
const MAX_POOL_SIZE = 3;

// Initialize connection pool
for (let i = 0; i < MAX_POOL_SIZE; i++) {
    CONNECTION_POOL.push(new Connection(process.env.SOLANA_RPC_URL));
}

// Get connection from pool
function getConnection() {
    return CONNECTION_POOL[Math.floor(Math.random() * CONNECTION_POOL.length)];
}

// Update verifyWallet function with better caching and connection handling
async function verifyWallet(userId, walletAddress) {
    try {
        console.log(`Checking wallet ${walletAddress} for user ${userId}`);
        
        // Check cache first
        const cacheKey = `wallet:${walletAddress}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
            console.log('Using cached wallet data');
            return JSON.parse(cached);
        }

        // Get BUX balance and NFTs in parallel with single connection
        const connection = getConnection();
        const [buxBalance, nftAccounts] = await Promise.all([
            getBUXBalance(walletAddress),
            getNFTAccounts(walletAddress, connection)
        ]);

        console.log(`BUX balance for ${walletAddress}:`, buxBalance);

        // Count NFTs
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

        const result = {
            success: true,
            data: {
                nftCounts,
                buxBalance,
                dailyReward: await calculateDailyReward(nftCounts)
            }
        };

        // Cache the result
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));

        return result;

    } catch (error) {
        console.error('Error in verifyWallet:', error);
        throw error;
    }
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

// Update updateDiscordRoles to handle errors better
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

        // Process wallets with rate limiting
        const results = [];
        for (const wallet of wallets) {
            try {
                const result = await verifyWallet(userId, wallet);
                if (result.success) {
                    results.push(result);
                }
                await sleep(1000); // Rate limit between wallets
            } catch (error) {
                console.error(`Error verifying wallet ${wallet}:`, error);
            }
        }

        // Calculate totals
        const totalNftCounts = {
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

        let totalBuxBalance = 0;

        results.forEach(result => {
            Object.keys(totalNftCounts).forEach(key => {
                totalNftCounts[key] += result.data.nftCounts[key];
            });
            totalBuxBalance += result.data.buxBalance;
        });

        // Update roles using role IDs
        const rolesToAdd = [];

        // Add NFT roles
        if (totalNftCounts.fcked_catz > 0) rolesToAdd.push(process.env.ROLE_ID_FCKED_CATZ);
        if (totalNftCounts.celebcatz > 0) rolesToAdd.push(process.env.ROLE_ID_CELEBCATZ);
        if (totalNftCounts.money_monsters > 0) rolesToAdd.push(process.env.ROLE_ID_MONEY_MONSTERS);
        if (totalNftCounts.money_monsters3d > 0) rolesToAdd.push(process.env.ROLE_ID_MONEY_MONSTERS3D);
        if (totalNftCounts.ai_bitbots > 0) rolesToAdd.push(process.env.ROLE_ID_AI_BITBOTS);
        if (totalNftCounts.warriors > 0) rolesToAdd.push(process.env.ROLE_ID_WARRIORS);
        if (totalNftCounts.squirrels > 0) rolesToAdd.push(process.env.ROLE_ID_SQUIRRELS);
        if (totalNftCounts.rjctd_bots > 0) rolesToAdd.push(process.env.ROLE_ID_RJCTD_BOTS);
        if (totalNftCounts.energy_apes > 0) rolesToAdd.push(process.env.ROLE_ID_ENERGY_APES);
        if (totalNftCounts.doodle_bots > 0) rolesToAdd.push(process.env.ROLE_ID_DOODLE_BOTS);
        if (totalNftCounts.candy_bots > 0) rolesToAdd.push(process.env.ROLE_ID_CANDY_BOTS);

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
