import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { redis } from '../config/redis.js';
import { config } from '../config/config.js';
import { calculateDailyReward } from './rewards.js';

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
        
        // Debug log the actual wallet address being checked
        console.log('Checking wallet against hashlists:', walletAddress);
        console.log('Current hashlist sizes:', {
            fckedCatz: hashlists.fckedCatz.size,
            celebCatz: hashlists.celebCatz.size,
            moneyMonsters: hashlists.moneyMonsters.size,
            moneyMonsters3d: hashlists.moneyMonsters3d.size,
            aiBitbots: hashlists.aiBitbots.size,
            warriors: hashlists.warriors.size,
            squirrels: hashlists.squirrels.size,
            rjctdBots: hashlists.rjctdBots.size,
            energyApes: hashlists.energyApes.size,
            doodleBots: hashlists.doodleBots.size,
            candyBots: hashlists.candyBots.size
        });

        // Get NFT holdings using Metaplex
        const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
        const nftAccounts = await retryWithBackoff(() => 
            connection.getParsedTokenAccountsByOwner(
                new PublicKey(walletAddress),
                { programId: TOKEN_PROGRAM_ID }
            )
        );

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

        // Check each token account
        for (const account of nftAccounts.value) {
            if (account.account.data.parsed.info.tokenAmount.amount === "1") {
                const mintAddress = account.account.data.parsed.info.mint;
                
                // Check each hashlist
                if (hashlists.fckedCatz.has(mintAddress)) {
                    nftCounts.fcked_catz++;
                    console.log('Found NFT in fckedCatz:', mintAddress);
                }
                if (hashlists.celebCatz.has(mintAddress)) {
                    nftCounts.celebcatz++;
                    console.log('Found NFT in celebCatz:', mintAddress);
                }
                if (hashlists.moneyMonsters.has(mintAddress)) {
                    nftCounts.money_monsters++;
                    console.log('Found NFT in moneyMonsters:', mintAddress);
                }
                if (hashlists.moneyMonsters3d.has(mintAddress)) {
                    nftCounts.money_monsters3d++;
                    console.log('Found NFT in moneyMonsters3d:', mintAddress);
                }
                if (hashlists.aiBitbots.has(mintAddress)) {
                    nftCounts.ai_bitbots++;
                    console.log('Found NFT in aiBitbots:', mintAddress);
                }
                if (hashlists.warriors.has(mintAddress)) {
                    nftCounts.warriors++;
                    console.log('Found NFT in warriors:', mintAddress);
                }
                if (hashlists.squirrels.has(mintAddress)) {
                    nftCounts.squirrels++;
                    console.log('Found NFT in squirrels:', mintAddress);
                }
                if (hashlists.rjctdBots.has(mintAddress)) {
                    nftCounts.rjctd_bots++;
                    console.log('Found NFT in rjctdBots:', mintAddress);
                }
                if (hashlists.energyApes.has(mintAddress)) {
                    nftCounts.energy_apes++;
                    console.log('Found NFT in energyApes:', mintAddress);
                }
                if (hashlists.doodleBots.has(mintAddress)) {
                    nftCounts.doodle_bots++;
                    console.log('Found NFT in doodleBots:', mintAddress);
                }
                if (hashlists.candyBots.has(mintAddress)) {
                    nftCounts.candy_bots++;
                    console.log('Found NFT in candyBots:', mintAddress);
                }
            }
        }

        // Get BUX balance
        const buxBalance = await getBUXBalance(walletAddress);
        console.log('BUX Balance:', buxBalance);

        // Log final counts
        console.log('Final NFT counts:', nftCounts);

        return {
            success: true,
            nftCounts,
            buxBalance
        };

    } catch (error) {
        console.error('Error in verifyHolder:', error);
        throw error;
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
        // Verify the wallet
        const result = await verifyHolder(walletAddress);
        
        // Calculate daily reward
        const dailyReward = await calculateDailyReward(result.nftCounts, result.buxBalance);

        // Format the response
        const response = {
            success: true,
            message: 'Wallet verified successfully',
            data: {
                nftCounts: result.nftCounts,
                buxBalance: result.buxBalance,
                dailyReward
            },
            formattedResponse: `
                **Wallet Verification Successful!**
                
                VERIFIED NFTs
               
                Fcked Catz - ${result.nftCounts.fcked_catz}
                Celeb Catz - ${result.nftCounts.celebcatz}
                Monsters - ${result.nftCounts.money_monsters}
                3D Monsters - ${result.nftCounts.money_monsters3d}
                BitBots - ${result.nftCounts.ai_bitbots}
                
                A.I. collabs - ${(result.nftCounts.warriors || 0) + 
                                (result.nftCounts.squirrels || 0) + 
                                (result.nftCounts.rjctd_bots || 0) + 
                                (result.nftCounts.energy_apes || 0) + 
                                (result.nftCounts.doodle_bots || 0) + 
                                (result.nftCounts.candy_bots || 0)}

                **Daily reward - ${dailyReward} BUX**
            `
        };

        return response;

    } catch (error) {
        console.error('Error in verifyWallet:', error);
        return {
            success: false,
            error: error.message,
            data: {
                nftCounts: {
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
                },
                buxBalance: 0,
                dailyReward: 0
            }
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

// Add storeWalletAddress function
async function storeWalletAddress(userId, walletAddress, walletType) {
    try {
        console.log('Storing wallet:', {
            userId,
            walletAddress,
            walletType
        });

        // Store in Redis with timestamp
        const walletData = {
            address: walletAddress,
            type: walletType,
            lastUpdated: new Date().toISOString()
        };

        await redis.set(`wallet:${userId}`, JSON.stringify(walletData));
        console.log('Wallet data stored for user', userId, ':', walletData);

        return {
            success: true,
            message: 'Wallet stored successfully'
        };
    } catch (error) {
        console.error('Error storing wallet:', error);
        throw error;
    }
}

// Update hashlist function
function updateHashlists(newHashlists) {
    console.log('Updating hashlists with:', {
        fckedCatz: newHashlists.fckedCatz?.size || 0,
        celebCatz: newHashlists.celebCatz?.size || 0,
        moneyMonsters: newHashlists.moneyMonsters?.size || 0,
        moneyMonsters3d: newHashlists.moneyMonsters3d?.size || 0,
        aiBitbots: newHashlists.aiBitbots?.size || 0,
        warriors: newHashlists.warriors?.size || 0,
        squirrels: newHashlists.squirrels?.size || 0,
        rjctdBots: newHashlists.rjctdBots?.size || 0,
        energyApes: newHashlists.energyApes?.size || 0,
        doodleBots: newHashlists.doodleBots?.size || 0,
        candyBots: newHashlists.candyBots?.size || 0,
        mmTop10: newHashlists.mmTop10?.size || 0,
        mm3dTop10: newHashlists.mm3dTop10?.size || 0
    });
    
    hashlists = {
        fckedCatz: newHashlists.fckedCatz || new Set(),
        celebCatz: newHashlists.celebCatz || new Set(),
        moneyMonsters: newHashlists.moneyMonsters || new Set(),
        moneyMonsters3d: newHashlists.moneyMonsters3d || new Set(),
        aiBitbots: newHashlists.aiBitbots || new Set(),
        warriors: newHashlists.warriors || new Set(),
        squirrels: newHashlists.squirrels || new Set(),
        rjctdBots: newHashlists.rjctdBots || new Set(),
        energyApes: newHashlists.energyApes || new Set(),
        doodleBots: newHashlists.doodleBots || new Set(),
        candyBots: newHashlists.candyBots || new Set(),
        mmTop10: newHashlists.mmTop10 || new Set(),
        mm3dTop10: newHashlists.mm3dTop10 || new Set()
    };
}

// Single export statement at the end
export {
    verifyHolder,
    verifyWallet,
    updateDiscordRoles,
    getBUXBalance,
    hashlists,
    storeWalletAddress,
    updateHashlists
};
