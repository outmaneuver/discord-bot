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
        const cachedResult = await redis.get(`verify:${userId}:${walletAddress}`);
        if (cachedResult) {
            return JSON.parse(cachedResult);
        }

        const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
        
        // Get NFT counts and BUX balance in parallel with individual timeouts
        const [nftCounts, buxBalance] = await Promise.all([
            Promise.race([
                verifyHolder(walletAddress),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('NFT verification timeout')), 10000)
                )
            ]),
            Promise.race([
                getBUXBalance(walletAddress),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('BUX balance timeout')), 10000)
                )
            ])
        ]);

        const result = {
            success: true,
            nftCounts,
            buxBalance
        };

        // Cache result for 5 minutes
        await redis.setex(
            `verify:${userId}:${walletAddress}`,
            300,
            JSON.stringify(result)
        );

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
    // ... existing updateDiscordRoles implementation ...
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
