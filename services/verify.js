import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { redis } from '../config/redis.js';
import { calculateDailyReward } from './rewards.js';

// Add constants at the top of the file
const ALL_NFT_ROLES = [
    'Fcked Catz Holder',
    'Celeb Catz Holder',
    'Money Monsters Holder',
    '3D Monsters Holder',
    'AI Bitbots Holder',
    'Warriors Holder',
    'Squirrels Holder',
    'RJCTD Bots Holder',
    'Energy Apes Holder',
    'Doodle Bots Holder',
    'Candy Bots Holder'
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

async function retryWithBackoff(fn, maxRetries = 5, maxDelay = 8000) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (!error.message.includes('429 Too Many Requests') || i === maxRetries - 1) {
                throw error;
            }
            const delay = Math.min(1000 * Math.pow(2, i), maxDelay);
            console.log(`Rate limited, waiting ${delay}ms before retry ${i + 1}/${maxRetries}`);
            await sleep(delay);
        }
    }
    throw lastError;
}

async function verifyWallet(userId, walletAddress) {
    try {
        // Check cache first
        const cacheKey = `verify:${walletAddress}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
            console.log('Cache hit for wallet:', walletAddress);
            return JSON.parse(cached);
        }

        console.log('Cache miss for wallet:', walletAddress);
        const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
        
        // Add delay between RPC calls
        await sleep(RATE_LIMIT_DELAY);

        // Get NFTs with retry and longer backoff
        const nftAccounts = await retryWithBackoff(
            () => connection.getParsedTokenAccountsByOwner(
                new PublicKey(walletAddress),
                { programId: TOKEN_PROGRAM_ID }
            ),
            5, // More retries
            8000 // Longer max delay
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

        // Cache the result
        const result = {
            success: true,
            data: {
                nftCounts,
                buxBalance,
                dailyReward
            }
        };

        await redis.setex(cacheKey, WALLET_CACHE_TTL, JSON.stringify(result));
        return result;

    } catch (error) {
        console.error('Error in verifyWallet:', error);
        throw error;
    }
}

async function updateDiscordRoles(userId, client) {
    try {
        console.log('Starting role update for user:', userId);
        
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) {
            console.error('Guild not found:', {
                guildId: process.env.GUILD_ID,
                availableGuilds: Array.from(client.guilds.cache.keys())
            });
            throw new Error('Guild not found');
        }

        const member = await guild.members.fetch(userId);
        if (!member) {
            console.error('Member not found:', {
                userId,
                guildId: guild.id,
                guildName: guild.name
            });
            throw new Error('Member not found');
        }

        console.log('Current roles:', {
            userId,
            username: member.user.username,
            roles: member.roles.cache.map(r => ({
                id: r.id,
                name: r.name
            }))
        });

        // Get wallets and verify
        const wallets = await redis.smembers(`wallets:${userId}`);
        console.log('Found wallets:', wallets);

        // Calculate total BUX balance and NFT counts
        let totalBuxBalance = 0;
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

        for (const walletAddress of wallets) {
            const result = await verifyWallet(userId, walletAddress);
            if (result.success) {
                Object.keys(nftCounts).forEach(key => {
                    nftCounts[key] += result.data.nftCounts[key];
                });
                totalBuxBalance += result.data.buxBalance;
            }
        }

        console.log('Verification results:', {
            userId,
            username: member.user.username,
            nftCounts,
            totalBuxBalance
        });

        // Determine roles
        const shouldHaveRoles = new Set();
        const buxRoleIds = new Set();

        // Add NFT roles
        if (nftCounts.fcked_catz > 0) shouldHaveRoles.add('Fcked Catz Holder');
        if (nftCounts.celebcatz > 0) shouldHaveRoles.add('Celeb Catz Holder');
        if (nftCounts.money_monsters > 0) shouldHaveRoles.add('Money Monsters Holder');
        if (nftCounts.money_monsters3d > 0) shouldHaveRoles.add('3D Monsters Holder');
        if (nftCounts.ai_bitbots > 0) shouldHaveRoles.add('AI Bitbots Holder');
        if (nftCounts.warriors > 0) shouldHaveRoles.add('Warriors Holder');
        if (nftCounts.squirrels > 0) shouldHaveRoles.add('Squirrels Holder');
        if (nftCounts.rjctd_bots > 0) shouldHaveRoles.add('RJCTD Bots Holder');
        if (nftCounts.energy_apes > 0) shouldHaveRoles.add('Energy Apes Holder');
        if (nftCounts.doodle_bots > 0) shouldHaveRoles.add('Doodle Bots Holder');
        if (nftCounts.candy_bots > 0) shouldHaveRoles.add('Candy Bots Holder');

        // Add BUX roles based on balance
        if (totalBuxBalance >= 50000) buxRoleIds.add(process.env.ROLE_ID_50000_BUX);
        if (totalBuxBalance >= 25000) buxRoleIds.add(process.env.ROLE_ID_25000_BUX);
        if (totalBuxBalance >= 10000) buxRoleIds.add(process.env.ROLE_ID_10000_BUX);
        if (totalBuxBalance >= 2500) buxRoleIds.add(process.env.ROLE_ID_2500_BUX);

        console.log('Role calculation:', {
            userId,
            username: member.user.username,
            shouldHaveRoles: Array.from(shouldHaveRoles),
            buxRoleIds: Array.from(buxRoleIds),
            buxBalance: totalBuxBalance
        });

        // Get current roles
        const currentRoles = member.roles.cache;
        
        // Track roles to add and remove
        const rolesToAdd = [];
        const rolesToRemove = [];

        // Check NFT roles
        const currentNftRoleNames = currentRoles
            .filter(role => ALL_NFT_ROLES.includes(role.name))
            .map(role => role.name);

        // Add missing NFT roles
        for (const roleName of shouldHaveRoles) {
            if (!currentNftRoleNames.includes(roleName)) {
                const role = guild.roles.cache.find(r => r.name === roleName);
                if (role) {
                    rolesToAdd.push(role);
                    console.log(`Adding NFT role ${roleName} to ${member.user.username}`);
                }
            }
        }

        // Remove extra NFT roles
        for (const roleName of currentNftRoleNames) {
            if (!shouldHaveRoles.includes(roleName)) {
                const role = guild.roles.cache.find(r => r.name === roleName);
                if (role) {
                    rolesToRemove.push(role);
                    console.log(`Removing NFT role ${roleName} from ${member.user.username}`);
                }
            }
        }

        // Check BUX roles
        const currentBuxRoleIds = currentRoles
            .filter(role => Object.keys(BUX_ROLES).includes(role.id))
            .map(role => role.id);

        // Add missing BUX roles
        for (const roleId of buxRoleIds) {
            if (!currentBuxRoleIds.includes(roleId)) {
                const role = guild.roles.cache.get(roleId);
                if (role) {
                    rolesToAdd.push(role);
                    console.log(`Adding BUX role ${role.name} to ${member.user.username}`);
                }
            }
        }

        // Remove extra BUX roles
        for (const roleId of currentBuxRoleIds) {
            if (!buxRoleIds.has(roleId)) {
                const role = guild.roles.cache.get(roleId);
                if (role) {
                    rolesToRemove.push(role);
                    console.log(`Removing BUX role ${role.name} from ${member.user.username}`);
                }
            }
        }

        console.log('Role updates:', {
            userId,
            username: member.user.username,
            adding: rolesToAdd.map(r => r.name),
            removing: rolesToRemove.map(r => r.name)
        });

        // Apply role changes
        if (rolesToAdd.length > 0) {
            await member.roles.add(rolesToAdd);
        }
        if (rolesToRemove.length > 0) {
            await member.roles.remove(rolesToRemove);
        }

        // Verify final roles
        const updatedMember = await guild.members.fetch(userId);
        console.log('Final roles:', {
            userId,
            username: updatedMember.user.username,
            roles: updatedMember.roles.cache.map(r => ({
                id: r.id,
                name: r.name
            }))
        });

        console.log('BUX balance check:', {
            userId,
            username: member.user.username,
            totalBuxBalance,
            currentBuxRoles: member.roles.cache
                .filter(role => Object.keys(BUX_ROLES).includes(role.id))
                .map(r => ({
                    id: r.id,
                    name: r.name,
                    threshold: BUX_ROLES[r.id]
                }))
        });

        console.log('BUX roles to assign:', {
            userId,
            username: member.user.username,
            totalBuxBalance,
            rolesToAdd: Array.from(buxRoleIds).map(id => ({
                id,
                threshold: BUX_ROLES[id]
            }))
        });

        console.log('Final BUX roles:', {
            userId,
            username: member.user.username,
            roles: member.roles.cache
                .filter(role => Object.keys(BUX_ROLES).includes(role.id))
                .map(r => ({
                    id: r.id,
                    name: r.name,
                    threshold: BUX_ROLES[r.id]
                }))
        });

        return {
            success: true,
            nftCounts,
            buxBalance: totalBuxBalance,
            roles: Array.from(shouldHaveRoles)
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
