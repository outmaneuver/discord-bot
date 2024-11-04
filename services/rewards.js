import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  }
});

const REWARD_TIERS = {
  WHALE: {
    minNFTs: 25,
    multiplier: 1.5
  },
  HOLDER: {
    minNFTs: 1,
    multiplier: 1
  }
};

async function calculateDailyReward(nftCounts, buxBalance) {
  let totalReward = 0;
  
  // Calculate base rewards
  for (const [collection, count] of Object.entries(nftCounts)) {
    const baseRate = rewardRates[collection] || 0;
    
    // Apply tier multiplier
    const tier = count >= REWARD_TIERS.WHALE.minNFTs ? REWARD_TIERS.WHALE : REWARD_TIERS.HOLDER;
    totalReward += count * baseRate * tier.multiplier;
  }

  // Add BUX balance bonus
  if (buxBalance > 1000) {
    totalReward *= 1.1; // 10% bonus for BUX holders
  }

  return Math.floor(totalReward);
}

async function startOrUpdateDailyTimer(userId, nftCounts, buxBalance) {
  try {
    const key = `timer:${userId}`;
    const timerData = await redis.get(key);
    
    if (timerData) {
      const data = JSON.parse(timerData);
      data.claimAmount = await calculateDailyReward(nftCounts, buxBalance);
      await redis.set(key, JSON.stringify(data));
      return data;
    }

    const newData = {
      lastClaim: Date.now(),
      claimAmount: await calculateDailyReward(nftCounts, buxBalance)
    };
    
    await redis.set(key, JSON.stringify(newData));
    return newData;
  } catch (error) {
    console.error('Error updating daily timer:', error.message);
    return null;
  }
}

async function getTimeUntilNextClaim(userId) {
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
    console.error('Error in getTimeUntilNextClaim:', error.message);
    return '00:00:00';
  }
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

// Single export statement for all functions
export {
    calculateDailyReward,
    startOrUpdateDailyTimer,
    getTimeUntilNextClaim,
    getClaimableAmount
};
