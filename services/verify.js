import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { redis } from '../config/redis.js';
import { config } from '../config/config.js';

// Initialize hashlists object
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

const BUX_TOKEN_MINT = 'FMiRxSbLqRTWiBszt1DZmXd7SrscWCccY7fcXNtwWxHK';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff(fn, maxRetries = 5) {
    let retries = 0;
    while (true) {
        try {
            return await fn();
        } catch (error) {
            if (!error.message.includes('429 Too Many Requests') || retries >= maxRetries) {
                throw error;
            }
            retries++;
            const delay = Math.min(1000 * Math.pow(2, retries), 10000);
            console.log(`Rate limited, retrying in ${delay}ms...`);
            await sleep(delay);
        }
    }
}

async function getBUXBalance(walletAddress) {
    try {
        const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
        const tokenAccounts = await retryWithBackoff(() => 
            connection.getParsedTokenAccountsByOwner(
                new PublicKey(walletAddress),
                { mint: new PublicKey(BUX_TOKEN_MINT) }
            )
        );

        let totalBalance = 0;
        for (const account of tokenAccounts.value) {
            if (account.account.data.parsed.info.mint === BUX_TOKEN_MINT) {
                totalBalance += parseInt(account.account.data.parsed.info.tokenAmount.amount);
            }
        }

        return totalBalance;
    } catch (error) {
        console.error('Error getting BUX balance:', error);
        return 0;
    }
}

async function verifyHolder(walletAddress) {
    try {
        const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
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

        const tokenAccounts = await retryWithBackoff(() =>
            connection.getParsedTokenAccountsByOwner(
                new PublicKey(walletAddress),
                { programId: TOKEN_PROGRAM_ID }
            )
        );

        for (const account of tokenAccounts.value) {
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

        return nftCounts;
    } catch (error) {
        console.error('Error verifying holder:', error);
        throw error;
    }
}

async function verifyWallet(userId, walletAddress) {
    try {
        // First check Redis cache
        const cacheKey = `verify:${userId}:${walletAddress}`;
        const cachedResult = await redis.get(cacheKey);
        if (cachedResult) {
            console.log('Using cached verification result');
            return JSON.parse(cachedResult);
        }

        // Get NFT counts and BUX balance in parallel with retries
        const [nftCounts, buxBalance] = await Promise.all([
            retryWithBackoff(async () => {
                // Check cache first
                const nftCacheKey = `nfts:${walletAddress}`;
                const cachedNfts = await redis.get(nftCacheKey);
                if (cachedNfts) {
                    console.log('Using cached NFT counts');
                    return JSON.parse(cachedNfts);
                }

                const counts = await verifyHolder(walletAddress);
                // Cache NFT counts for 1 hour
                await redis.setex(nftCacheKey, 3600, JSON.stringify(counts));
                return counts;
            }, 3),
            retryWithBackoff(async () => {
                // Check cache first
                const buxCacheKey = `bux:${walletAddress}`;
                const cachedBux = await redis.get(buxCacheKey);
                if (cachedBux) {
                    console.log('Using cached BUX balance');
                    return parseInt(cachedBux);
                }

                const balance = await getBUXBalance(walletAddress);
                // Cache BUX balance for 5 minutes
                await redis.setex(buxCacheKey, 300, balance.toString());
                return balance;
            }, 3)
        ]);

        const result = {
            success: true,
            nftCounts,
            buxBalance
        };

        // Cache final result for 5 minutes
        await redis.setex(cacheKey, 300, JSON.stringify(result));

        return result;
    } catch (error) {
        console.error('Error verifying wallet:', error);
        
        // Try to return cached data even if verification fails
        try {
            const cachedResult = await redis.get(`verify:${userId}:${walletAddress}`);
            if (cachedResult) {
                console.log('Returning cached data after error');
                return {
                    ...JSON.parse(cachedResult),
                    fromCache: true
                };
            }
        } catch (cacheError) {
            console.error('Error getting cached data:', cacheError);
        }

        return {
            success: false,
            error: error.message
        };
    }
}

async function updateDiscordRoles(userId, client) {
    try {
        const walletData = await redis.smembers(`wallets:${userId}`);
        if (!walletData || walletData.length === 0) {
            return {
                success: false,
                error: 'No wallets found',
                nftCounts: null
            };
        }

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

        // Check each wallet
        for (const wallet of walletData) {
            try {
                const walletNftCounts = await verifyHolder(wallet);
                Object.keys(nftCounts).forEach(key => {
                    nftCounts[key] += walletNftCounts[key] || 0;
                });
            } catch (error) {
                console.error(`Error checking wallet ${wallet}:`, error);
                // Continue with next wallet
            }
        }

        // Get guild and member
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) throw new Error('Guild not found');

        const member = await guild.members.fetch(userId);
        if (!member) throw new Error('Member not found');

        // Update roles based on NFT counts
        const rolesToAdd = [];
        const rolesToRemove = [];

        // Define role mappings
        const roleChecks = {
            'CAT': () => nftCounts.fcked_catz > 0,
            'CELEB': () => nftCounts.celebcatz > 0,
            'MONSTER': () => nftCounts.money_monsters > 0,
            'MONSTER 3D': () => nftCounts.money_monsters3d > 0,
            'BITBOT': () => nftCounts.ai_bitbots > 0,
            'AI warrior': () => nftCounts.warriors > 0,
            'AI squirrel': () => nftCounts.squirrels > 0,
            'Rjctd bot': () => nftCounts.rjctd_bots > 0,
            'AI energy ape': () => nftCounts.energy_apes > 0,
            'Doodle bot': () => nftCounts.doodle_bots > 0,
            'Candy bot': () => nftCounts.candy_bots > 0
        };

        // Check each role
        for (const [roleName, checkFn] of Object.entries(roleChecks)) {
            const role = guild.roles.cache.find(r => r.name === roleName);
            if (role) {
                if (checkFn()) {
                    if (!member.roles.cache.has(role.id)) {
                        rolesToAdd.push(role);
                    }
                } else {
                    if (member.roles.cache.has(role.id)) {
                        rolesToRemove.push(role);
                    }
                }
            }
        }

        // Apply role changes
        if (rolesToAdd.length > 0) await member.roles.add(rolesToAdd);
        if (rolesToRemove.length > 0) await member.roles.remove(rolesToRemove);

        return {
            success: true,
            nftCounts,
            rolesAdded: rolesToAdd.map(r => r.name),
            rolesRemoved: rolesToRemove.map(r => r.name)
        };

    } catch (error) {
        console.error('Error updating Discord roles:', error);
        return {
            success: false,
            error: error.message,
            nftCounts: null
        };
    }
}

async function updateHashlists(newHashlists) {
    hashlists = newHashlists;
}

export {
    verifyHolder,
    verifyWallet,
    updateDiscordRoles,
    updateHashlists,
    getBUXBalance,
    hashlists
};
