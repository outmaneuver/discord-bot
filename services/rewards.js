import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Update Redis config to handle self-signed certs
const redis = new Redis(process.env.REDIS_URL, {
    tls: {
        rejectUnauthorized: false
    }
});

// Correct reward rates per collection
const REWARD_RATES = {
    // AI Collabs - 1 BUX per day
    warriors: 1,
    squirrels: 1,
    rjctd_bots: 1,
    energy_apes: 1,
    doodle_bots: 1,
    candy_bots: 1,
    
    // AI Bitbots - 3 BUX per day
    ai_bitbots: 3,
    
    // Main collections - 5 BUX per day
    fcked_catz: 5,
    money_monsters: 5,
    
    // 3D Monsters - 10 BUX per day
    money_monsters3d: 10,
    
    // Celebs - 15 BUX per day
    celebcatz: 15
};

async function calculateDailyReward(nftCounts) {
    let totalReward = 0;
    
    // Calculate rewards based on collection rates
    for (const [collection, count] of Object.entries(nftCounts)) {
        totalReward += (REWARD_RATES[collection] || 0) * count;
    }
    
    return totalReward;
}

async function getClaimableAmount(userId) {
    try {
        const claimable = await redis.get(`claimable:${userId}`);
        return claimable ? parseInt(claimable) : 0;
    } catch (error) {
        console.error('Error getting claimable amount:', error);
        return 0;
    }
}

export {
    calculateDailyReward,
    getClaimableAmount
};
