import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redis = new Redis(process.env.REDIS_URL);

async function reconnectRedis() {
    try {
        console.log('Reconnecting to Redis...');
        
        // Test connection by getting a key count
        const keys = await redis.keys('nft:fcked_catz:*');
        console.log(`Successfully reconnected to Redis`);
        console.log(`Found ${keys.length} NFTs in database`);
        
        // Test getting a specific NFT to verify data access
        const testNft = await redis.hgetall(keys[0]);
        console.log('\nSample NFT data:');
        console.log(testNft);
        
        await redis.quit();
        process.exit(0);

    } catch (error) {
        console.error('Error reconnecting to Redis:', error);
        await redis.quit();
        process.exit(1);
    }
}

// Run the reconnection
reconnectRedis(); 