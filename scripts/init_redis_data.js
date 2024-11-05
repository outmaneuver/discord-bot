import Redis from 'ioredis';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

dotenv.config();

// Parse Redis URL to determine if TLS is needed
const redisUrl = new URL(process.env.REDIS_URL);
const useTLS = redisUrl.protocol === 'rediss:';

// Configure Redis options based on URL
const redisOptions = {
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

const redis = new Redis(process.env.REDIS_URL, redisOptions);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function getTokenOwner(mint, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(`https://api-mainnet.magiceden.dev/v2/tokens/${mint}`);
            if (!response.ok) {
                if (response.status === 429) {
                    // Rate limited, wait longer
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    continue;
                }
                throw new Error(`Magic Eden API error: ${response.status}`);
            }
            const data = await response.json();
            return {
                owner: data.owner,
                name: data.name,
                image: data.image,
                attributes: data.attributes
            };
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

async function getRarityData(mint, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(
                `https://api.howrare.is/v0.1/collections/fckedcatz/only_rarity?mint=${mint}`
            );
            if (!response.ok) {
                if (response.status === 429) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    continue;
                }
                throw new Error(`HowRare API error: ${response.status}`);
            }
            const data = await response.json();
            return data.result.data.items[0];
        } catch (error) {
            if (i === retries - 1) return null;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    return null;
}

async function initializeRedisData() {
    try {
        console.log('Starting Redis data initialization...');

        // Load hashlist
        const hashlistPath = path.join(__dirname, '..', 'config', 'hashlists', 'fcked_catz.json');
        const hashlist = JSON.parse(fs.readFileSync(hashlistPath, 'utf8'));
        
        console.log(`Found ${hashlist.length} Fcked Catz tokens in hashlist`);

        // Clear existing data
        const keys = await redis.keys('nft:fcked_catz:*');
        if (keys.length > 0) {
            await redis.del(keys);
            console.log('Cleared existing Fcked Catz data');
        }

        let processed = 0;
        let failed = 0;
        const failedMints = [];

        // Process tokens
        for (const mint of hashlist) {
            try {
                console.log(`Processing ${mint}...`);
                
                // Get owner and metadata with retries
                const { owner, name, image, attributes } = await getTokenOwner(mint);
                
                // Get rarity data with retries
                const rarityData = await getRarityData(mint);
                
                // Store NFT data
                await redis.hset(`nft:fcked_catz:${mint}`, {
                    owner,
                    tokenId: name.split('#')[1],
                    name,
                    image,
                    traits: JSON.stringify(attributes),
                    rarity: rarityData?.rank?.toString() || '',
                    rankAlgo: rarityData?.rank_algo || '',
                    lastPrice: '0',
                    lastSaleDate: '0'
                });

                processed++;
                console.log(`Processed ${processed}/${hashlist.length}`);

                // Add delay between requests
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                console.error(`Failed to process ${mint}:`, error);
                failed++;
                failedMints.push(mint);
            }
        }

        console.log('\nInitialization completed:');
        console.log(`Processed: ${processed}`);
        console.log(`Failed: ${failed}`);
        
        if (failedMints.length > 0) {
            console.log('\nFailed mints:');
            failedMints.forEach(mint => console.log(mint));
            
            // Save failed mints to file for later processing
            const failedPath = path.join(__dirname, 'failed_mints.json');
            fs.writeFileSync(failedPath, JSON.stringify(failedMints, null, 2));
            console.log(`\nFailed mints saved to ${failedPath}`);
        }

        await redis.quit();
        process.exit(0);

    } catch (error) {
        console.error('Error initializing Redis data:', error);
        await redis.quit();
        process.exit(1);
    }
}

// Run initialization
initializeRedisData();