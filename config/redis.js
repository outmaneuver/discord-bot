import Redis from 'ioredis';
import { config } from './config.js';

// Configure Redis with TLS options
const redisOptions = {
    tls: {
        rejectUnauthorized: false // Allow self-signed certificates
    },
    retryStrategy: function(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    connectTimeout: 10000
};

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