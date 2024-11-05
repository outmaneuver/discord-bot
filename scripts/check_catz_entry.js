import Redis from 'ioredis';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const redis = new Redis(process.env.REDIS_URL, {
    tls: {
        rejectUnauthorized: false,
        requestCert: true,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3'
    },
    retryStrategy: function(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    connectTimeout: 10000
});

redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function checkCatzEntry(tokenId) {
    try {
        console.log(`Checking Fcked Catz #${tokenId}...`);
        
        // Get all NFT keys
        const keys = await redis.keys('nft:fcked_catz:*');
        let targetNft = null;

        // Find NFT with matching token ID
        for (const key of keys) {
            const data = await redis.hgetall(key);
            if (parseInt(data.tokenId) === parseInt(tokenId)) {
                targetNft = {
                    mint: key.split(':')[2],
                    ...data
                };
                break;
            }
        }

        if (!targetNft) {
            console.log(`No NFT found with token ID #${tokenId}`);
            return;
        }

        console.log('\nNFT Details:');
        console.log('----------------');
        console.log(`Mint: ${targetNft.mint}`);
        console.log(`Owner: ${targetNft.owner}`);
        console.log(`Token ID: ${targetNft.tokenId}`);
        console.log(`Rarity Rank: ${targetNft.rarity || 'Not set'}`);
        console.log(`Last Price: ${targetNft.lastPrice || '0'} SOL`);
        console.log(`Last Sale: ${targetNft.lastSaleDate ? new Date(parseInt(targetNft.lastSaleDate)).toLocaleString() : 'Never'}`);

        await redis.quit();
        process.exit(0);

    } catch (error) {
        console.error('Error checking NFT:', error);
        await redis.quit();
        process.exit(1);
    }
}

// Get token ID from command line argument
const tokenId = process.argv[2];
if (!tokenId) {
    console.error('Please provide a token ID (e.g. node check_catz_entry.js 1234)');
    process.exit(1);
}

// Run the check
checkCatzEntry(tokenId); 