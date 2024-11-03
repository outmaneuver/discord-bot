import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { redis } from '../config/redis.js';
import { calculateDailyReward } from './rewards.js';

const BUX_TOKEN_MINT = 'FMiRxSbLqRTWiBszt1DZmXd7SrscWCccY7fcXNtwWxHK';

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
    candyBots: new Set()
};

// Simple function to verify NFTs from hashlists
async function verifyWallet(userId, walletAddress) {
    try {
        console.log(`Checking wallet ${walletAddress} for user ${userId}`);
        
        // Get BUX balance
        const buxBalance = await getBUXBalance(walletAddress);
        console.log(`BUX balance for ${walletAddress}:`, buxBalance);

        // Check NFTs against hashlists
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

        // Get NFT token accounts from cache
        const cacheKey = `nfts:${walletAddress}`;
        let nftAccounts = await redis.get(cacheKey);
        
        if (!nftAccounts) {
            // If not in cache, get from chain
            const connection = new Connection(process.env.SOLANA_RPC_URL);
            const accounts = await connection.getParsedTokenAccountsByOwner(
                new PublicKey(walletAddress),
                { programId: TOKEN_PROGRAM_ID }
            );
            
            nftAccounts = accounts.value.map(acc => acc.account.data.parsed.info.mint);
            await redis.setex(cacheKey, 300, JSON.stringify(nftAccounts));
        } else {
            nftAccounts = JSON.parse(nftAccounts);
        }

        // Check NFTs against hashlists
        for (const mint of nftAccounts) {
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

        const result = {
            success: true,
            data: {
                nftCounts,
                buxBalance,
                dailyReward: await calculateDailyReward(nftCounts)
            }
        };

        return result;

    } catch (error) {
        console.error('Error in verifyWallet:', error);
        throw error;
    }
}

// Get BUX balance with caching
async function getBUXBalance(walletAddress) {
    try {
        const cacheKey = `bux:${walletAddress}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
            return parseInt(cached);
        }

        const connection = new Connection(process.env.SOLANA_RPC_URL);
        const buxAccounts = await connection.getParsedTokenAccountsByOwner(
            new PublicKey(walletAddress),
            { mint: new PublicKey(BUX_TOKEN_MINT) }
        );

        let totalBalance = 0;
        for (const account of buxAccounts.value) {
            totalBalance += Number(account.account.data.parsed.info.tokenAmount.amount);
        }

        await redis.setex(cacheKey, 300, totalBalance.toString());
        return totalBalance / Math.pow(10, 9);
    } catch (error) {
        console.error('Error getting BUX balance:', error);
        return 0;
    }
}

// Store wallet address
async function storeWalletAddress(userId, walletAddress) {
    try {
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
        candyBots: new Set(newHashlists.candyBots)
    };
}

export {
    verifyWallet,
    hashlists,
    updateHashlists,
    getBUXBalance,
    storeWalletAddress
};
