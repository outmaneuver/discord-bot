import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Parse Redis URL to determine if TLS is needed
const redisUrl = new URL(process.env.REDIS_URL);
console.log('Redis protocol:', redisUrl.protocol);

// Configure Redis options based on URL
const redisOptions = {
    ...(redisUrl.protocol === 'rediss:' && {
        tls: {
            rejectUnauthorized: false
        }
    })
};

const redis = new Redis(process.env.REDIS_URL, redisOptions);

redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});

redis.on('connect', () => {
    console.log('Connected to Redis');
});

// Test the connection
async function testConnection() {
    try {
        // List all keys to see what's in Redis
        const allKeys = await redis.keys('*');
        console.log('\nAll Redis keys:', allKeys);

        // Try to get a Fcked Catz entry
        const catzKeys = await redis.keys('nft:fcked_catz:*');
        console.log('\nFcked Catz keys:', catzKeys);
        
        if (catzKeys.length > 0) {
            const data = await redis.hgetall(catzKeys[0]);
            console.log('\nSample entry:', data);
        }

        // Check other collections too
        const celebKeys = await redis.keys('nft:celebcatz:*');
        console.log('\nCeleb Catz keys:', celebKeys);

        const mmKeys = await redis.keys('nft:money_monsters:*');
        console.log('\nMoney Monsters keys:', mmKeys);
        
        await redis.quit();
        process.exit(0);
    } catch (error) {
        console.error('Test failed:', error);
        await redis.quit();
        process.exit(1);
    }
}

testConnection(); 