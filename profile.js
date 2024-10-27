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

export async function getWalletData(userId) {
  const key = `wallets:${userId}`;
  try {
    const walletAddresses = await redis.smembers(key);
    console.log(`Retrieved wallets for user ${userId}:`, walletAddresses);
    return { walletAddresses };
  } catch (error) {
    console.error(`Error retrieving wallet data for user ${userId}:`, error);
    throw error;
  }
}
