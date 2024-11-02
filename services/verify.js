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

async function getBUXBalance(walletAddress) {
    const cacheKey = `bux:${walletAddress}`;
    try {
        // Check cache first
        const cached = await redis.get(cacheKey);
        if (cached) {
            return parseInt(cached);
        }

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

        // Cache BUX balance for 5 minutes
        await redis.setex(cacheKey, 300, totalBalance.toString());
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

        console.log('Verifying wallet:', walletAddress);

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

        // Check NFTs against hashlists
        if (hashlists.fckedCatz.has(walletAddress)) nftCounts.fcked_catz++;
        if (hashlists.celebCatz.has(walletAddress)) nftCounts.celebcatz++;
        if (hashlists.moneyMonsters.has(walletAddress)) nftCounts.money_monsters++;
        if (hashlists.moneyMonsters3d.has(walletAddress)) nftCounts.money_monsters3d++;
        if (hashlists.aiBitbots.has(walletAddress)) nftCounts.ai_bitbots++;
        if (hashlists.warriors.has(walletAddress)) nftCounts.warriors++;
        if (hashlists.squirrels.has(walletAddress)) nftCounts.squirrels++;
        if (hashlists.rjctdBots.has(walletAddress)) nftCounts.rjctd_bots++;
        if (hashlists.energyApes.has(walletAddress)) nftCounts.energy_apes++;
        if (hashlists.doodleBots.has(walletAddress)) nftCounts.doodle_bots++;
        if (hashlists.candyBots.has(walletAddress)) nftCounts.candy_bots++;

        // Get BUX balance
        const buxBalance = await getBUXBalance(walletAddress);

        console.log('BUX Balance:', buxBalance);
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

// Export functions
export {
    verifyHolder,
    getBUXBalance,
    hashlists,
    updateHashlists
};
