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
        const cached = await redis.get(cacheKey);
        if (cached) return parseInt(cached);

        const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            new PublicKey(walletAddress),
            { mint: new PublicKey(BUX_TOKEN_MINT) }
        );

        let totalBalance = 0;
        for (const account of tokenAccounts.value) {
            if (account.account.data.parsed.info.mint === BUX_TOKEN_MINT) {
                totalBalance += parseInt(account.account.data.parsed.info.tokenAmount.amount);
            }
        }

        await redis.setex(cacheKey, 300, totalBalance.toString());
        return totalBalance;

    } catch (error) {
        console.error('Error getting BUX balance:', error.message);
        return 0;
    }
}

async function verifyWallet(userId, walletAddress) {
    try {
        const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
        
        // Get all token accounts owned by the wallet
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            new PublicKey(walletAddress),
            { programId: TOKEN_PROGRAM_ID }
        );

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
        for (const account of tokenAccounts.value) {
            // Only count tokens with amount = 1 (NFTs)
            if (account.account.data.parsed.info.tokenAmount.amount === "1") {
                const mintAddress = account.account.data.parsed.info.mint;
                
                // Check which collection this NFT belongs to
                if (hashlists.fckedCatz.has(mintAddress)) nftCounts.fcked_catz++;
                if (hashlists.celebCatz.has(mintAddress)) nftCounts.celebcatz++;
                if (hashlists.moneyMonsters.has(mintAddress)) nftCounts.money_monsters++;
                if (hashlists.moneyMonsters3d.has(mintAddress)) nftCounts.money_monsters3d++;
                if (hashlists.aiBitbots.has(mintAddress)) nftCounts.ai_bitbots++;
                if (hashlists.warriors.has(mintAddress)) nftCounts.warriors++;
                if (hashlists.squirrels.has(mintAddress)) nftCounts.squirrels++;
                if (hashlists.rjctdBots.has(mintAddress)) nftCounts.rjctd_bots++;
                if (hashlists.energyApes.has(mintAddress)) nftCounts.energy_apes++;
                if (hashlists.doodleBots.has(mintAddress)) nftCounts.doodle_bots++;
                if (hashlists.candyBots.has(mintAddress)) nftCounts.candy_bots++;
            }
        }

        const buxBalance = await getBUXBalance(walletAddress);
        const dailyReward = await calculateDailyReward(nftCounts, buxBalance);

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
