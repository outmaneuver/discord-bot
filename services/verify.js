import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { redis } from '../config/redis.js';
import { calculateDailyReward } from './rewards.js';

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

async function retryWithBackoff(fn, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (!error.message.includes('429 Too Many Requests') || i === maxRetries - 1) {
                throw error;
            }
            const delay = Math.min(1000 * Math.pow(2, i), 8000);
            console.log(`Rate limited, waiting ${delay}ms before retry ${i + 1}/${maxRetries}`);
            await sleep(delay);
        }
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

        const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
        
        // Get NFTs with retry
        const nftAccounts = await retryWithBackoff(() => 
            connection.getParsedTokenAccountsByOwner(
                new PublicKey(walletAddress),
                { programId: TOKEN_PROGRAM_ID }
            )
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

        // Check each NFT
        for (const account of nftAccounts.value) {
            const tokenAmount = account.account.data.parsed.info.tokenAmount;
            const mintAddress = account.account.data.parsed.info.mint;

            if (tokenAmount.amount === "1" && tokenAmount.decimals === 0) {
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

        // Get BUX balance
        const buxAccounts = await connection.getParsedTokenAccountsByOwner(
            new PublicKey(walletAddress),
            { mint: new PublicKey(BUX_TOKEN_MINT) }
        );

        let buxBalance = 0;
        for (const account of buxAccounts.value) {
            const tokenAmount = account.account.data.parsed.info.tokenAmount;
            if (tokenAmount.decimals === 9) {
                buxBalance += Number(tokenAmount.uiAmount);
            }
        }

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

async function updateDiscordRoles(userId, client) {
    try {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) throw new Error('Guild not found');

        const member = await guild.members.fetch(userId);
        if (!member) throw new Error('Member not found');

        const wallets = await redis.smembers(`wallets:${userId}`);
        if (!wallets || wallets.length === 0) {
            throw new Error('No wallets found for user');
        }

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

        // Check NFTs for all connected wallets
        for (const walletAddress of wallets) {
            const result = await verifyWallet(userId, walletAddress);
            if (result.success) {
                Object.keys(nftCounts).forEach(key => {
                    nftCounts[key] += result.data.nftCounts[key];
                });
            }
        }

        // Update roles based on NFT counts
        const roles = new Set();
        if (nftCounts.fcked_catz > 0) roles.add('Fcked Catz Holder');
        if (nftCounts.celebcatz > 0) roles.add('Celeb Catz Holder');
        if (nftCounts.money_monsters > 0) roles.add('Money Monsters Holder');
        if (nftCounts.money_monsters3d > 0) roles.add('3D Monsters Holder');
        if (nftCounts.ai_bitbots > 0) roles.add('AI Bitbots Holder');

        // Update member roles
        const guildRoles = Array.from(roles).map(roleName => 
            guild.roles.cache.find(role => role.name === roleName)
        ).filter(role => role);

        await member.roles.set(guildRoles);

        return {
            success: true,
            nftCounts,
            roles: Array.from(roles)
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

export {
    verifyWallet,
    updateDiscordRoles,
    hashlists,
    updateHashlists
};
