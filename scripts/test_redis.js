import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Simple Redis connection
const redis = new Redis(process.env.REDIS_URL);

redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});

redis.on('connect', () => {
    console.log('Connected to Redis');
});

// Test the connection
async function testConnection() {
    try {
        // Try to get a Fcked Catz entry
        const keys = await redis.keys('nft:fcked_catz:*');
        console.log(`Found ${keys.length} Fcked Catz entries`);
        
        if (keys.length > 0) {
            const data = await redis.hgetall(keys[0]);
            console.log('Sample entry:', data);
        }
        
        await redis.quit();
        process.exit(0);
    } catch (error) {
        console.error('Test failed:', error);
        await redis.quit();
        process.exit(1);
    }
}

testConnection(); 