import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  }
});

export async function calculateDailyReward(nftCounts, buxBalance) {
  try {
    let reward = 0;  // No base reward

    // Add rewards based on NFT holdings only
    if (nftCounts) {
      // Main collections
      reward += (nftCounts.fcked_catz || 0) * 5;      // 5 BUX per FCatz
      reward += (nftCounts.celebcatz || 0) * 15;      // 15 BUX per CelebCatz
      reward += (nftCounts.money_monsters || 0) * 5;   // 5 BUX per MM
      reward += (nftCounts.money_monsters3d || 0) * 10; // 10 BUX per MM3D
      reward += (nftCounts.ai_bitbots || 0) * 3;      // 3 BUX per AI Bitbot

      // AI Collabs - 1 BUX each
      reward += (nftCounts.warriors || 0) * 1;        // 1 BUX per Warriors
      reward += (nftCounts.squirrels || 0) * 1;       // 1 BUX per Squirrels
      reward += (nftCounts.rjctd_bots || 0) * 1;      // 1 BUX per RJCTD
      reward += (nftCounts.energy_apes || 0) * 1;     // 1 BUX per Energy Apes
      reward += (nftCounts.doodle_bots || 0) * 1;     // 1 BUX per Doodle Bots
      reward += (nftCounts.candy_bots || 0) * 1;      // 1 BUX per Candy Bots
    }

    return reward;
  } catch (error) {
    console.error('Error calculating daily reward:', error);
    return 0; // Return 0 on error
  }
}

export async function startOrUpdateDailyTimer(userId, nftCounts, buxBalance) {
  try {
    const key = `daily_timer:${userId}`;
    const claimKey = `bux_claim:${userId}`;
    
    // Get last check time
    const lastCheck = await redis.get(key);
    const now = Date.now();
    
    if (!lastCheck) {
      // First time setup
      await redis.set(key, now);
      return {
        nextClaimTime: now + (24 * 60 * 60 * 1000),
        claimAmount: 0
      };
    }

    const timeDiff = now - parseInt(lastCheck);
    if (timeDiff >= 24 * 60 * 60 * 1000) {
      // 24 hours passed, add reward to claim balance
      const reward = await calculateDailyReward(nftCounts, buxBalance);
      const currentClaim = parseInt(await redis.get(claimKey) || '0');
      await redis.set(claimKey, currentClaim + reward);
      await redis.set(key, now);
      
      console.log('Updated daily timer:', {
        userId,
        reward,
        currentClaim,
        newClaim: currentClaim + reward
      });

      return {
        nextClaimTime: now + (24 * 60 * 60 * 1000),
        claimAmount: currentClaim + reward
      };
    }

    return {
      nextClaimTime: parseInt(lastCheck) + (24 * 60 * 60 * 1000),
      claimAmount: parseInt(await redis.get(claimKey) || '0')
    };
  } catch (error) {
    console.error('Error in startOrUpdateDailyTimer:', error);
    return {
      nextClaimTime: Date.now() + (24 * 60 * 60 * 1000),
      claimAmount: 0
    };
  }
}

export async function getTimeUntilNextClaim(userId) {
  try {
    const key = `daily_timer:${userId}`;
    const lastCheck = await redis.get(key);
    
    if (!lastCheck) return null;

    const nextClaimTime = parseInt(lastCheck) + (24 * 60 * 60 * 1000);
    const timeLeft = nextClaimTime - Date.now();
    
    if (timeLeft <= 0) return '00:00:00';
    
    const hours = Math.floor(timeLeft / (60 * 60 * 1000));
    const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((timeLeft % (60 * 1000)) / 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } catch (error) {
    console.error('Error in getTimeUntilNextClaim:', error);
    return '00:00:00';
  }
}
