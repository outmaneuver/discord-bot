import Redis from 'ioredis';
import { config } from './config.js';

export const redis = new Redis(config.redis.url, {
  ...config.redis.options,
  connectTimeout: 20000,
  disconnectTimeout: 5000,
  keepAlive: 30000,
  noDelay: true,
  commandTimeout: 5000,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  autoResubscribe: true,
  autoResendUnfulfilledCommands: true,
  lazyConnect: true
});

redis.on('error', (err) => {
  console.error('Redis connection error:', {
    code: err.code,
    timestamp: new Date().toISOString(),
    connectionState: redis.status
  });
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