import Redis from 'ioredis';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

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

const COLLECTION_SLUG = 'fckedcatz';

async function fetchRarityData(mint) {
    try {
        const response = await fetch(
            `https://api.howrare.is/v0.1/collections/${COLLECTION_SLUG}/only_rarity?mint=${mint}`
        );

        if (!response.ok) {
            throw new Error(`HowRare API error: ${response.status}`);
        }

        const data = await response.json();
        return data.result.data;
    } catch (error) {
        console.error('Error fetching rarity data:', error);
        throw error;
    }
}

async function addMissingRarity() {
    try {
        console.log('Starting missing rarity check...');
        
        // Get all NFT keys from Redis
        const keys = await redis.keys('nft:fcked_catz:*');
        console.log(`Found ${keys.length} NFTs in database`);

        let updated = 0;
        let failed = 0;

        // Check each NFT for missing rarity
        for (const key of keys) {
            try {
                const nftData = await redis.hgetall(key);
                
                // Skip if rarity already exists
                if (nftData.rarity && nftData.rankAlgo) {
                    continue;
                }

                const mint = key.split(':')[2];
                console.log(`Fetching rarity for ${mint}...`);

                const rarityData = await fetchRarityData(mint);
                
                if (rarityData && rarityData.items[0]) {
                    await redis.hset(key, {
                        rarity: rarityData.items[0].rank.toString(),
                        rankAlgo: rarityData.items[0].rank_algo
                    });
                    updated++;
                    console.log(`Updated rarity for ${mint}`);
                } else {
                    failed++;
                    console.error(`No rarity data found for ${mint}`);
                }

                // Add delay between requests
                await new Promise(resolve => setTimeout(resolve, 2000));

            } catch (error) {
                console.error(`Error processing NFT:`, error);
                failed++;
            }
        }

        console.log('Rarity update completed');
        console.log(`Updated: ${updated}`);
        console.log(`Failed: ${failed}`);
        
        await redis.quit();
        process.exit(0);

    } catch (error) {
        console.error('Error updating rarity:', error);
        await redis.quit();
        process.exit(1);
    }
}

// Run the update
addMissingRarity(); 