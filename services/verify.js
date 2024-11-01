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
        // Add input validation
        if (!walletAddress || typeof walletAddress !== 'string') {
            throw new Error('Invalid wallet address');
        }

        // Add rate limiting check
        const rateLimitKey = `ratelimit:verify:${walletAddress}`;
        const attempts = await redis.incr(rateLimitKey);
        await redis.expire(rateLimitKey, 60); // 1 minute expiry
        
        if (attempts > 5) {
            throw new Error('Rate limit exceeded. Please try again later.');
        }

        console.log('Verifying wallet:', walletAddress);
        
        // Get NFT holdings
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

        // Count NFTs from each collection
        for (const [collection, hashlist] of Object.entries(hashlists)) {
            if (hashlist.has(walletAddress)) {
                const collectionKey = collection.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                if (nftCounts.hasOwnProperty(collectionKey)) {
                    nftCounts[collectionKey]++;
                }
            }
        }

        // Get BUX balance
        const buxBalance = await getBUXBalance(walletAddress);
        console.log('BUX Balance:', buxBalance);

        // Check if wallet has any NFTs or BUX
        const hasAnyAssets = Object.values(nftCounts).some(count => count > 0) || buxBalance > 0;

        if (!hasAnyAssets) {
            return {
                success: true,
                formattedResponse: 
                    "**Wallet Verification Complete**\n\n" +
                    "This wallet currently has:\n" +
                    "• No BUX$DAO NFTs\n" +
                    "• No BUX tokens\n\n" +
                    "To participate in BUX$DAO:\n" +
                    "1. Get BUX$DAO NFTs from Magic Eden or Tensor\n" +
                    "2. Hold BUX tokens\n" +
                    "3. Join our Discord community\n\n" +
                    "Visit https://buxdao.io for more information.",
                nftCounts,
                buxBalance
            };
        }

        // Format response for wallets with assets
        let response = "**Wallet Verification Complete**\n\n";
        response += "Your wallet contains:\n";
        
        // Add NFT counts
        for (const [collection, count] of Object.entries(nftCounts)) {
            if (count > 0) {
                const displayName = getDisplayName(collection);
                response += `• ${count} ${displayName}\n`;
            }
        }

        // Add BUX balance if any
        if (buxBalance > 0) {
            response += `• ${buxBalance.toLocaleString()} BUX tokens\n`;
        }

        return {
            success: true,
            formattedResponse: response,
            nftCounts,
            buxBalance
        };

    } catch (error) {
        console.error('Error in verifyHolder:', error);
        return {
            success: false,
            error: error.message,
            formattedResponse: "Error verifying wallet. Please try again later."
        };
    }
}

// Helper function to get display names
function getDisplayName(collection) {
    const displayNames = {
        fcked_catz: 'Fcked Catz',
        celebcatz: 'Celeb Catz',
        money_monsters: 'Money Monsters',
        money_monsters3d: 'Money Monsters 3D',
        ai_bitbots: 'AI Bitbots',
        warriors: 'AI Warriors',
        squirrels: 'AI Squirrels',
        rjctd_bots: 'Rjctd Bots',
        energy_apes: 'Energy Apes',
        doodle_bots: 'Doodle Bots',
        candy_bots: 'Candy Bots'
    };
    return displayNames[collection] || collection;
}

async function verifyWallet(userId, walletAddress) {
    try {
        // First check Redis cache
        const cacheKey = `verify:${userId}:${walletAddress}`;
        let cachedResult;
        try {
            const cachedData = await redis.get(cacheKey);
            if (cachedData) {
                console.log('Using cached verification result');
                cachedResult = JSON.parse(cachedData);
            }
        } catch (cacheError) {
            console.error('Cache read error:', cacheError);
            // Delete the problematic key
            await redis.del(cacheKey);
        }

        if (cachedResult) return cachedResult;

        // Get NFT counts and BUX balance in parallel with retries
        const [nftCounts, buxBalance] = await Promise.all([
            retryWithBackoff(async () => {
                // Check cache first
                const nftCacheKey = `nfts:${walletAddress}`;
                try {
                    const cachedNfts = await redis.get(nftCacheKey);
                    if (cachedNfts) {
                        console.log('Using cached NFT counts');
                        return JSON.parse(cachedNfts);
                    }
                } catch (error) {
                    console.error('NFT cache error:', error);
                    await redis.del(nftCacheKey);
                }

                const counts = await verifyHolder(walletAddress);
                // Cache NFT counts for 1 hour
                await redis.setex(nftCacheKey, 3600, JSON.stringify(counts));
                return counts;
            }, 3),
            retryWithBackoff(async () => {
                // Check cache first
                const buxCacheKey = `bux:${walletAddress}`;
                try {
                    const cachedBux = await redis.get(buxCacheKey);
                    if (cachedBux) {
                        console.log('Using cached BUX balance');
                        return parseInt(cachedBux);
                    }
                } catch (error) {
                    console.error('BUX cache error:', error);
                    await redis.del(buxCacheKey);
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

        // Update daily reward timer after successful verification
        try {
            const { startOrUpdateDailyTimer, calculateDailyReward } = await import('./rewards.js');
            const dailyReward = await calculateDailyReward(nftCounts);
            console.log('Daily reward calculation:', {
                nftCounts,
                dailyReward
            });
            await startOrUpdateDailyTimer(userId, nftCounts);

            // Format the response message with the calculated daily reward
            result.formattedResponse = `
      **Wallet Verification Successful!**
      
      VERIFIED NFTs
     
      Fcked Catz - ${nftCounts.fcked_catz}
      Celeb Catz - ${nftCounts.celebcatz}
      Monsters - ${nftCounts.money_monsters}
      3D Monsters - ${nftCounts.money_monsters3d}
      BitBots - ${nftCounts.ai_bitbots}
      
      A.I. collabs - ${nftCounts.warriors + nftCounts.squirrels + nftCounts.rjctd_bots + 
                      nftCounts.energy_apes + nftCounts.doodle_bots + nftCounts.candy_bots}

      **Daily reward - ${dailyReward || 0} BUX**
    `;

            result.dailyReward = dailyReward; // Make sure to add it to the result object
        } catch (error) {
            console.error('Error updating daily reward:', error);
            // Set default values if calculation fails
            result.dailyReward = 0;
            result.formattedResponse = result.formattedResponse.replace('Daily reward - 0 BUX', 'Error calculating rewards');
        }

        // Cache final result for 5 minutes
        try {
            await redis.setex(cacheKey, 300, JSON.stringify(result));
        } catch (error) {
            console.error('Error caching result:', error);
        }

        return result;
    } catch (error) {
        console.error('Error verifying wallet:', error);
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
            'Candy bot': () => nftCounts.candy_bots > 0,
            // Add whale roles
            'MONSTER 🐋': () => nftCounts.money_monsters >= 20,
            'MONSTER 3D 🐋': () => nftCounts.money_monsters3d >= 20,
            'MEGA BOT 🐋': () => nftCounts.ai_bitbots >= 10,
            'CAT 🐋': () => nftCounts.fcked_catz >= 10,
            'CELEB 🐋': () => nftCounts.celebcatz >= 2
        };

        // Add debug logging
        console.log('Role assignment check:', {
            nftCounts,
            eligibleRoles: Object.entries(roleChecks)
                .filter(([_, checkFn]) => checkFn())
                .map(([roleName]) => roleName)
        });

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

// Update storeWalletAddress function to handle wallet type
async function storeWalletAddress(userId, walletAddress, walletType) {
    try {
        console.log('Storing wallet:', {
            userId,
            walletAddress,
            walletType
        });

        const key = `user:${userId}:wallet`;
        const walletData = {
            address: walletAddress,
            type: walletType || 'unknown',
            lastUpdated: new Date().toISOString()
        };

        await redis.set(key, JSON.stringify(walletData));
        console.log(`Wallet data stored for user ${userId}:`, walletData);
        
        return {
            success: true,
            message: 'Wallet address stored successfully'
        };
    } catch (error) {
        console.error('Error storing wallet address:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

export {
    verifyHolder,
    verifyWallet,
    updateDiscordRoles,
    updateHashlists,
    getBUXBalance,
    hashlists,
    storeWalletAddress
};
