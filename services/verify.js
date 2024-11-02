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

// Update connection creation with proper endpoint handling
function createConnection() {
    const endpoint = RPC_ENDPOINTS[currentRpcIndex];
    currentRpcIndex = (currentRpcIndex + 1) % RPC_ENDPOINTS.length;
    
    console.log(`Using RPC endpoint: ${endpoint.url} (weight: ${endpoint.weight})`);
    
    const connectionConfig = {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: RPC_TIMEOUT,
        disableRetryOnRateLimit: true
    };

    return new Connection(endpoint.url, connectionConfig);
}

// Update retryWithBackoff function
async function retryWithBackoff(fn, maxRetries = 5, maxDelay = 8000) {
    let lastError;
    let currentEndpoint;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            // Get next endpoint
            currentEndpoint = RPC_ENDPOINTS[currentRpcIndex];
            currentRpcIndex = (currentRpcIndex + 1) % RPC_ENDPOINTS.length;
            
            console.log(`Using RPC endpoint: ${currentEndpoint.url} (weight: ${currentEndpoint.weight})`);
            
            // Create connection with current endpoint
            const connection = createConnection(currentEndpoint);
            
            return await Promise.race([
                fn(connection),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('RPC Timeout')), RPC_TIMEOUT)
                )
            ]);
        } catch (error) {
            lastError = error;
            
            // Update endpoint success rate on error
            if (currentEndpoint) {
                currentEndpoint.successRate = (currentEndpoint.successRate || 1) * 0.9;
            }

            if (i === maxRetries - 1) {
                throw error;
            }

            const isRateLimit = error.message.includes('429') || 
                              error.message.includes('Too Many Requests');
            const isTimeout = error.message.includes('timeout') || 
                            error.message.includes('Timeout') ||
                            error.code === 'UND_ERR_CONNECT_TIMEOUT';
            const isApiKeyError = error.message.includes('API key') ||
                                error.message.includes('-32052');

            // Skip retry for API key errors
            if (!isRateLimit && !isTimeout && !isApiKeyError) {
                throw error;
            }

            const delay = Math.min(1000 * Math.pow(2, i), maxDelay);
            console.log(`RPC error (${isApiKeyError ? 'API key' : isTimeout ? 'timeout' : 'rate limit'}), waiting ${delay}ms before retry ${i + 1}/${maxRetries}`);
            await sleep(delay);
        }
    }
    throw lastError;
}

// Update verifyWallet function to always get fresh data
async function verifyWallet(userId, walletAddress) {
    try {
        console.log(`Checking wallet ${walletAddress} for user ${userId}`);
        
        // Initialize counters
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

        // Always get fresh BUX balance
        const buxBalance = await getBUXBalance(walletAddress);
        console.log(`BUX balance for ${walletAddress}:`, buxBalance);

        // Get fresh NFT data with retries
        let nftAccounts;
        let retryCount = 0;
        
        while (retryCount < MAX_RETRIES) {
            try {
                await sleep(RATE_LIMIT_DELAY);
                const connection = createConnection();
                nftAccounts = await connection.getParsedTokenAccountsByOwner(
                    new PublicKey(walletAddress),
                    { programId: TOKEN_PROGRAM_ID }
                );
                break;
            } catch (error) {
                retryCount++;
                console.log(`RPC error (attempt ${retryCount}/${MAX_RETRIES}):`, error.message);
                
                if (retryCount === MAX_RETRIES) throw error;
                
                const delay = Math.min(1000 * Math.pow(2, retryCount), 8000);
                await sleep(delay);
            }
        }

        // Count NFTs
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

        // Calculate daily reward
        const dailyReward = await calculateDailyReward(nftCounts);

        return {
            success: true,
            data: {
                nftCounts,
                buxBalance,
                dailyReward
            }
        };

    } catch (error) {
        console.error('Error in verifyWallet:', error);
        throw error;
    }
}

// Update role assignment logic to use IDs directly
async function updateDiscordRoles(userId, client) {
    try {
        console.log('Starting role update for user:', userId);
        
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) throw new Error('Guild not found');

        const member = await guild.members.fetch(userId);
        if (!member) throw new Error('Member not found');

        // Get wallets and verify
        const wallets = await redis.smembers(`wallets:${userId}`);
        console.log('Found wallets:', wallets);

        // Calculate total BUX balance and NFT counts
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

        // Verify each wallet
        for (const walletAddress of wallets) {
            const result = await verifyWallet(userId, walletAddress);
            if (result.success) {
                Object.keys(nftCounts).forEach(key => {
                    nftCounts[key] += result.data.nftCounts[key];
                });
                totalBuxBalance += result.data.buxBalance;
            }
        }

        // Determine roles using IDs from .env
        const shouldHaveRoles = new Set();
        const buxRoleIds = new Set();

        // Add NFT roles using IDs
        if (nftCounts.fcked_catz > 0) shouldHaveRoles.add(process.env.ROLE_ID_FCKED_CATZ);
        if (nftCounts.celebcatz > 0) shouldHaveRoles.add(process.env.ROLE_ID_CELEBCATZ);
        if (nftCounts.money_monsters > 0) shouldHaveRoles.add(process.env.ROLE_ID_MONEY_MONSTERS);
        if (nftCounts.money_monsters3d > 0) shouldHaveRoles.add(process.env.ROLE_ID_MONEY_MONSTERS3D);
        if (nftCounts.ai_bitbots > 0) shouldHaveRoles.add(process.env.ROLE_ID_AI_BITBOTS);
        if (nftCounts.warriors > 0) shouldHaveRoles.add(process.env.ROLE_ID_WARRIORS);
        if (nftCounts.squirrels > 0) shouldHaveRoles.add(process.env.ROLE_ID_SQUIRRELS);
        if (nftCounts.rjctd_bots > 0) shouldHaveRoles.add(process.env.ROLE_ID_RJCTD_BOTS);
        if (nftCounts.energy_apes > 0) shouldHaveRoles.add(process.env.ROLE_ID_ENERGY_APES);
        if (nftCounts.doodle_bots > 0) shouldHaveRoles.add(process.env.ROLE_ID_DOODLE_BOTS);
        if (nftCounts.candy_bots > 0) shouldHaveRoles.add(process.env.ROLE_ID_CANDY_BOTS);

        // Add BUX roles based on balance
        if (totalBuxBalance >= 50000) buxRoleIds.add(process.env.ROLE_ID_50000_BUX);
        if (totalBuxBalance >= 25000) buxRoleIds.add(process.env.ROLE_ID_25000_BUX);
        if (totalBuxBalance >= 10000) buxRoleIds.add(process.env.ROLE_ID_10000_BUX);
        if (totalBuxBalance >= 2500) buxRoleIds.add(process.env.ROLE_ID_2500_BUX);

        // Get current roles
        const currentRoles = member.roles.cache;
        
        // Track roles to add and remove
        const rolesToAdd = [];
        const rolesToRemove = [];

        // Process NFT roles
        for (const roleId of shouldHaveRoles) {
            if (!currentRoles.has(roleId)) {
                const role = guild.roles.cache.get(roleId);
                if (role) rolesToAdd.push(role);
            }
        }

        // Process BUX roles
        for (const roleId of buxRoleIds) {
            if (!currentRoles.has(roleId)) {
                const role = guild.roles.cache.get(roleId);
                if (role) rolesToAdd.push(role);
            }
        }

        // Remove roles that shouldn't be there
        for (const role of currentRoles.values()) {
            const isNftRole = Object.values(process.env).includes(role.id);
            const isBuxRole = Object.values(BUX_ROLES).includes(role.id);
            
            if ((isNftRole && !shouldHaveRoles.has(role.id)) || 
                (isBuxRole && !buxRoleIds.has(role.id))) {
                rolesToRemove.push(role);
            }
        }

        // Apply role changes
        if (rolesToAdd.length > 0) {
            await member.roles.add(rolesToAdd);
            console.log('Added roles:', rolesToAdd.map(r => r.name));
        }
        if (rolesToRemove.length > 0) {
            await member.roles.remove(rolesToRemove);
            console.log('Removed roles:', rolesToRemove.map(r => r.name));
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
