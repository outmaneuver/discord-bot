export async function addWallet(userId, walletAddress) {
  const key = `wallets:${userId}`;
  try {
    const result = await redis.sadd(key, walletAddress);
    console.log(`Added wallet ${walletAddress} for user ${userId}. Result: ${result}`);
    return result === 1; // Returns true if the wallet was successfully added
  } catch (error) {
    console.error(`Error adding wallet ${walletAddress} for user ${userId}:`, error);
    throw error;
  }
}
