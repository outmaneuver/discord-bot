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

// Update verifyWallet function to handle multiple wallets efficiently
async function verifyWallet(userId, walletAddress) {
    try {
        console.log(`Checking wallet ${walletAddress} for user ${userId}`);
        
        // Get BUX balance first since it's faster
        const buxBalance = await getBUXBalance(walletAddress);
        console.log(`BUX balance for ${walletAddress}:`, buxBalance);

        // Create connection with longer timeout
        const connection = createConnection();
        
        // Get NFT accounts with single RPC call and longer timeout
        const nftAccounts = await Promise.race([
            connection.getParsedTokenAccountsByOwner(
                new PublicKey(walletAddress),
                { programId: TOKEN_PROGRAM_ID }
            ),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('RPC Timeout')), 15000)
            )
        ]);

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

// Update updateDiscordRoles to handle multiple wallets more efficiently
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

        // Verify all wallets in parallel with timeout
        const verifyPromises = wallets.map(wallet => 
            Promise.race([
                verifyWallet(userId, wallet),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Verification timeout')), 20000)
                )
            ])
        );

        // Wait for all verifications with overall timeout
        const results = await Promise.race([
            Promise.all(verifyPromises),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Overall verification timeout')), 25000)
            )
        ]);

        // Combine results
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
            if (result.success) {
                Object.keys(totalNftCounts).forEach(key => {
                    totalNftCounts[key] += result.data.nftCounts[key];
                });
                totalBuxBalance += result.data.buxBalance;
            }
        });

        // Update roles based on totals
        const rolesToAdd = [];
        const rolesToRemove = [];

        // Add NFT roles
        if (totalNftCounts.fcked_catz > 0) rolesToAdd.push('CAT');
        if (totalNftCounts.celebcatz > 0) rolesToAdd.push('CELEB');
        if (totalNftCounts.money_monsters > 0) rolesToAdd.push('MONSTER');
        if (totalNftCounts.money_monsters3d > 0) rolesToAdd.push('MONSTER 3D');
        if (totalNftCounts.ai_bitbots > 0) rolesToAdd.push('BITBOT');
        if (totalNftCounts.warriors > 0) rolesToAdd.push('AI warrior');
        if (totalNftCounts.squirrels > 0) rolesToAdd.push('AI squirrel');
        if (totalNftCounts.rjctd_bots > 0) rolesToAdd.push('Rjctd bot');
        if (totalNftCounts.energy_apes > 0) rolesToAdd.push('AI energy ape');
        if (totalNftCounts.doodle_bots > 0) rolesToAdd.push('Doodle bot');
        if (totalNftCounts.candy_bots > 0) rolesToAdd.push('Candy bot');

        // Add BUX roles based on total balance
        if (totalBuxBalance >= 50000) rolesToAdd.push('BUX BANKER');
        if (totalBuxBalance >= 25000) rolesToAdd.push('BUX SAVER');
        if (totalBuxBalance >= 10000) rolesToAdd.push('BUX BUILDER');
        if (totalBuxBalance >= 2500) rolesToAdd.push('BUX BEGINNER');

        // Apply role changes
        if (rolesToAdd.length > 0) {
            console.log('Added roles:', rolesToAdd);
            await member.roles.add(rolesToAdd.map(name => 
                guild.roles.cache.find(r => r.name === name)
            ).filter(r => r));
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
