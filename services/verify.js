import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { redis } from '../config/redis.js';
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

async function updateDiscordRoles(userId, client) {
    try {
        const walletData = await redis.get(`wallet:${userId}`);
        if (!walletData) {
            return {
                success: false,
                error: 'No wallet data found',
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
                }
            };
        }

        const { address: walletAddress } = JSON.parse(walletData);
        return await verifyWallet(userId, walletAddress);

    } catch (error) {
        console.error('Error updating Discord roles:', error.message);
        return {
            success: false,
            error: error.message,
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
            }
        };
    }
}

async function storeWalletAddress(userId, walletAddress, walletType) {
    try {
        const data = {
            address: walletAddress,
            type: walletType,
            lastUpdated: new Date().toISOString()
        };
        
        await redis.set(`wallet:${userId}`, JSON.stringify(data));
        return { success: true };
    } catch (error) {
        console.error('Error storing wallet:', error.message);
        throw error;
    }
}

async function getBUXBalance(walletAddress) {
    const cacheKey = `bux:${walletAddress}`;
    try {
        // Check cache first
        const cached = await redis.get(cacheKey);
        if (cached) return parseInt(cached);

        const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
        
        // Get BUX token accounts with retry
        const tokenAccounts = await retryWithBackoff(async () => {
            return await connection.getParsedTokenAccountsByOwner(
                new PublicKey(walletAddress),
                { mint: new PublicKey(BUX_TOKEN_MINT) }
            );
        });

        console.log('BUX token accounts:', tokenAccounts);

        let totalBalance = 0;
        for (const account of tokenAccounts.value) {
            const parsedInfo = account.account.data.parsed.info;
            if (parsedInfo.mint === BUX_TOKEN_MINT) {
                totalBalance += parseInt(parsedInfo.tokenAmount.amount);
            }
        }

        // Convert from raw amount to decimal amount
        const buxBalance = totalBalance / 1e9;
        console.log('Found BUX balance:', buxBalance);

        // Cache the result for 5 minutes
        await redis.setex(cacheKey, 300, totalBalance.toString());
        
        return buxBalance;

    } catch (error) {
        console.error('Error getting BUX balance:', error);
        return 0;
    }
}

async function verifyWallet(userId, walletAddress) {
    try {
        // Check cache first
        const cacheKey = `verify:${walletAddress}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 60000
        });

        // Get token accounts with retry and proper error handling
        const tokenAccounts = await retryWithBackoff(async () => {
            try {
                const accounts = await connection.getParsedTokenAccountsByOwner(
                    new PublicKey(walletAddress),
                    { programId: TOKEN_PROGRAM_ID }
                );
                return accounts;
            } catch (error) {
                console.error('Token account fetch error:', error);
                throw error;
            }
        }, 5);

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

        // Process token accounts with proper error handling
        for (const { account } of tokenAccounts.value) {
            try {
                const parsedData = account.data.parsed;
                const tokenAmount = parsedData.info.tokenAmount;
                const mintAddress = parsedData.info.mint;

                // Only count tokens with amount = 1 and decimals = 0 (NFTs)
                if (tokenAmount.amount === "1" && tokenAmount.decimals === 0) {
                    console.log('Found NFT:', mintAddress);
                    
                    // Check each collection
                    if (hashlists.moneyMonsters3d.has(mintAddress)) {
                        console.log('Found 3D Monster');
                        nftCounts.money_monsters3d++;
                    }
                    if (hashlists.fckedCatz.has(mintAddress)) {
                        console.log('Found Fcked Cat');
                        nftCounts.fcked_catz++;
                    }
                    if (hashlists.celebCatz.has(mintAddress)) {
                        console.log('Found Celeb Cat');
                        nftCounts.celebcatz++;
                    }
                    if (hashlists.moneyMonsters.has(mintAddress)) {
                        console.log('Found Money Monster');
                        nftCounts.money_monsters++;
                    }
                    if (hashlists.aiBitbots.has(mintAddress)) {
                        console.log('Found BitBot');
                        nftCounts.ai_bitbots++;
                    }
                    if (hashlists.warriors.has(mintAddress)) nftCounts.warriors++;
                    if (hashlists.squirrels.has(mintAddress)) nftCounts.squirrels++;
                    if (hashlists.rjctdBots.has(mintAddress)) nftCounts.rjctd_bots++;
                    if (hashlists.energyApes.has(mintAddress)) nftCounts.energy_apes++;
                    if (hashlists.doodleBots.has(mintAddress)) nftCounts.doodle_bots++;
                    if (hashlists.candyBots.has(mintAddress)) nftCounts.candy_bots++;
                }
            } catch (error) {
                console.error('Error processing token account:', error);
                continue; // Skip problematic accounts
            }
        }

        console.log('Final NFT counts:', nftCounts);

        // Get BUX balance with detailed logging
        console.log('Getting BUX balance for wallet:', walletAddress);
        const buxBalance = await getBUXBalance(walletAddress);
        console.log('BUX balance:', buxBalance);

        const dailyReward = await calculateDailyReward(nftCounts, buxBalance);
        console.log('Daily reward:', dailyReward);

        const result = {
            success: true,
            data: {
                nftCounts,
                buxBalance,
                dailyReward
            }
        };

        console.log('Final result:', result);
        return result;

    } catch (error) {
        console.error('Error in verifyWallet:', error);
        throw error;
    }
}

// Update retry logic
async function retryWithBackoff(fn, maxRetries = 5, initialDelay = 1000) {
    let retries = 0;
    let delay = initialDelay;

    while (true) {
        try {
            return await fn();
        } catch (error) {
            retries++;
            if (retries > maxRetries || !error.message.includes('429 Too Many Requests')) {
                throw error;
            }

            console.log(`Rate limited (attempt ${retries}/${maxRetries}), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay = Math.min(delay * 2, 10000); // Exponential backoff, max 10s
        }
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
    if (newHashlists.mmTop10) hashlists.mmTop10 = new Set(newHashlists.mmTop10);
    if (newHashlists.mm3dTop10) hashlists.mm3dTop10 = new Set(newHashlists.mm3dTop10);
}

export {
    verifyWallet,
    getBUXBalance,
    hashlists,
    updateHashlists,
    storeWalletAddress,
    updateDiscordRoles
};
