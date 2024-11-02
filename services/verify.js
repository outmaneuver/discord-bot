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
        if (!guild) {
            console.error('Guild not found:', process.env.GUILD_ID);
            throw new Error('Guild not found');
        }

        const member = await guild.members.fetch(userId);
        if (!member) {
            console.error('Member not found:', userId);
            throw new Error('Member not found');
        }

        console.log('Updating roles for user:', {
            userId,
            username: member.user.username,
            currentRoles: member.roles.cache.map(r => r.name)
        });

        // Define all possible NFT and BUX roles
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

        // Get wallets and verify
        const wallets = await redis.smembers(`wallets:${userId}`);
        console.log('Found wallets:', wallets);

        if (!wallets || wallets.length === 0) {
            console.log('No wallets found, removing all roles');
            const rolesToRemove = member.roles.cache.filter(role => 
                ALL_NFT_ROLES.includes(role.name) || 
                Object.keys(BUX_ROLES).includes(role.id)
            );
            console.log('Removing roles:', rolesToRemove.map(r => r.name));
            await member.roles.remove(rolesToRemove);
            return { success: true, nftCounts: {}, roles: [] };
        }

        // Calculate total BUX balance across all wallets
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

        // Determine which roles the user should have
        const shouldHaveRoles = new Set();
        
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
        const buxRoleIds = new Set();
        if (totalBuxBalance >= 50000) buxRoleIds.add(process.env.ROLE_ID_50000_BUX);
        if (totalBuxBalance >= 25000) buxRoleIds.add(process.env.ROLE_ID_25000_BUX);
        if (totalBuxBalance >= 10000) buxRoleIds.add(process.env.ROLE_ID_10000_BUX);
        if (totalBuxBalance >= 2500) buxRoleIds.add(process.env.ROLE_ID_2500_BUX);

        // Get current roles
        const currentNftRoles = new Set(
            member.roles.cache
                .filter(role => ALL_NFT_ROLES.includes(role.name))
                .map(role => role.name)
        );

        const currentBuxRoles = new Set(
            member.roles.cache
                .filter(role => Object.keys(BUX_ROLES).includes(role.id))
                .map(role => role.id)
        );

        // Determine roles to add and remove
        const nftRolesToAdd = [...shouldHaveRoles].filter(role => !currentNftRoles.has(role));
        const nftRolesToRemove = [...currentNftRoles].filter(role => !shouldHaveRoles.has(role));
        const buxRolesToAdd = [...buxRoleIds].filter(id => !currentBuxRoles.has(id));
        const buxRolesToRemove = [...currentBuxRoles].filter(id => !buxRoleIds.has(id));

        // Log role changes in detail
        console.log('Role update details:', {
            username: member.user.username,
            nftCounts,
            totalBuxBalance,
            currentRoles: member.roles.cache.map(r => r.name),
            nftRolesToAdd,
            nftRolesToRemove,
            buxRolesToAdd,
            buxRolesToRemove
        });

        // Perform role updates with logging
        const rolePromises = [];
        
        if (nftRolesToAdd.length > 0) {
            const addNftRoles = nftRolesToAdd
                .map(roleName => guild.roles.cache.find(r => r.name === roleName))
                .filter(role => role);
            console.log('Adding NFT roles:', addNftRoles.map(r => r.name));
            rolePromises.push(member.roles.add(addNftRoles));
        }
        
        if (nftRolesToRemove.length > 0) {
            const removeNftRoles = nftRolesToRemove
                .map(roleName => guild.roles.cache.find(r => r.name === roleName))
                .filter(role => role);
            console.log('Removing NFT roles:', removeNftRoles.map(r => r.name));
            rolePromises.push(member.roles.remove(removeNftRoles));
        }

        if (buxRolesToAdd.length > 0) {
            console.log('Adding BUX roles:', buxRolesToAdd);
            rolePromises.push(member.roles.add(buxRolesToAdd));
        }

        if (buxRolesToRemove.length > 0) {
            console.log('Removing BUX roles:', buxRolesToRemove);
            rolePromises.push(member.roles.remove(buxRolesToRemove));
        }

        // Wait for all role updates to complete
        await Promise.all(rolePromises);

        // Log final roles after update
        const updatedMember = await guild.members.fetch(userId);
        console.log('Final roles after update:', {
            username: updatedMember.user.username,
            roles: updatedMember.roles.cache.map(r => r.name)
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
