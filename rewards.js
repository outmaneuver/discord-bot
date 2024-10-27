import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  }
});

export async function calculateDailyReward(userId, nftCounts, buxBalance) {
  // Base reward
  let reward = 10;

  // Add rewards based on NFT holdings
  reward += nftCounts.fcked_catz.length * 2;
  reward += nftCounts.celebcatz.length * 3;
  reward += nftCounts.money_monsters.length * 2;
  reward += nftCounts.money_monsters3d.length * 3;
  reward += nftCounts.ai_bitbots.length * 2;

  // Add rewards based on BUX balance
  if (buxBalance >= 1000) reward += 5;
  if (buxBalance >= 10000) reward += 10;
  if (buxBalance >= 100000) reward += 20;

  return reward;
}

export async function startOrUpdateDailyTimer(userId, nftCounts, buxBalance) {
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
    const reward = await calculateDailyReward(userId, nftCounts, buxBalance);
    const currentClaim = parseInt(await redis.get(claimKey) || '0');
    await redis.set(claimKey, currentClaim + reward);
    await redis.set(key, now);
    
    return {
      nextClaimTime: now + (24 * 60 * 60 * 1000),
      claimAmount: currentClaim + reward
    };
  }

  return {
    nextClaimTime: parseInt(lastCheck) + (24 * 60 * 60 * 1000),
    claimAmount: parseInt(await redis.get(claimKey) || '0')
  };
}

export async function getTimeUntilNextClaim(userId) {
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
}
