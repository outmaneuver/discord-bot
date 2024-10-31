import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  }
});

export async function calculateDailyReward(nftCounts, buxBalance) {
  try {
    // Base rewards per NFT
    const rewardRates = {
      fcked_catz: 5,
      celebcatz: 15,
      money_monsters: 5,
      money_monsters3d: 10,
      ai_bitbots: 3,
      warriors: 1,
      squirrels: 1,
      rjctd_bots: 1,
      energy_apes: 1,
      doodle_bots: 1,
      candy_bots: 1
    };

    // Calculate total reward
    let totalReward = 0;
    for (const [collection, count] of Object.entries(nftCounts)) {
      if (rewardRates[collection]) {
        totalReward += count * rewardRates[collection];
      }
    }

    // Add BUX balance bonus (0.1% of balance)
    const buxBonus = Math.floor((buxBalance || 0) * 0.001);
    totalReward += buxBonus;

    console.log('Daily reward calculation:', {
      nftCounts,
      buxBalance,
      buxBonus,
      totalReward
    });

    return totalReward;
  } catch (error) {
    console.error('Error calculating daily reward:', error);
    return 0;
  }
}

export async function startOrUpdateDailyTimer(userId, nftCounts, buxBalance) {
  try {
    const key = `timer:${userId}`;
    const timerData = await redis.get(key);
    
    if (timerData) {
      const data = JSON.parse(timerData);
      // Update reward amount but keep timer
      data.claimAmount = await calculateDailyReward(nftCounts, buxBalance);
      await redis.set(key, JSON.stringify(data));
      return data;
    }

    // Start new timer
    const newData = {
      lastClaim: Date.now(),
      claimAmount: await calculateDailyReward(nftCounts, buxBalance)
    };
    
    await redis.set(key, JSON.stringify(newData));
    return newData;
  } catch (error) {
    console.error('Error updating daily timer:', error);
    return null;
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
