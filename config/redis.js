import Redis from 'ioredis';
import { config } from './config.js';

// Parse Redis URL to determine if TLS is needed
const redisUrl = new URL(config.redis.url);
const useTLS = redisUrl.protocol === 'rediss:';

// Configure Redis options based on URL
const redisOptions = {
    // Only add TLS options if using secure protocol
    ...(useTLS && {
        tls: {
            rejectUnauthorized: false
        }
    }),
    retryStrategy: function(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    connectTimeout: 10000
};

console.log('Connecting to Redis with protocol:', redisUrl.protocol);

export const redis = new Redis(config.redis.url, redisOptions);

redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});

redis.on('connect', () => {
    console.log('Redis connected successfully', {
        timestamp: new Date().toISOString(),
        instance: 'redis-elliptical',
        connectionState: redis.status
    });
});

redis.on('ready', () => {
    console.log('Redis client ready', {
        timestamp: new Date().toISOString(),
        connectionState: redis.status
    });
});

// Add graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, closing Redis connection...');
    await redis.quit();
    process.exit(0);
});

// Export the redis client
export default redis; 