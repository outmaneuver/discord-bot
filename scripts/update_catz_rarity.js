import Redis from 'ioredis';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

// Update Redis config to handle self-signed certs
const redis = new Redis(process.env.REDIS_URL, {
    tls: {
        rejectUnauthorized: false
    }
});

const COLLECTION_SLUG = 'fckedcatz';
const BATCH_SIZE = 1000;

async function fetchRarityData(page = 1) {
    try {
        const response = await fetch(
            `https://api.howrare.is/v0.1/collections/${COLLECTION_SLUG}/only_rarity?page=${page}&limit=${BATCH_SIZE}`
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

async function updateCatzRarity() {
    try {
        console.log('Starting Fcked Catz rarity update...');
        
        // Get all NFT keys from Redis
        const keys = await redis.keys('nft:fcked_catz:*');
        console.log(`Found ${keys.length} NFTs in database`);

        // Get initial data to determine total pages
        const initialData = await fetchRarityData(1);
        const totalPages = Math.ceil(1422 / BATCH_SIZE); // Total supply is 1422
        
        console.log(`Found ${totalPages} pages of rarity data to process`);
        
        let updated = 0;
        let failed = 0;
        let rarityMap = new Map();

        // Fetch all pages
        for (let page = 1; page <= totalPages; page++) {
            console.log(`Fetching page ${page}/${totalPages}`);
            
            try {
                const data = await fetchRarityData(page);
                
                // Store rarity data
                for (const item of data.items) {
                    rarityMap.set(item.mint, {
                        rank: item.rank,
                        rankAlgo: item.rank_algo
                    });
                }

                // Add delay between pages
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
                console.error(`Error fetching page ${page}:`, error);
                continue;
            }
        }

        console.log(`Fetched rarity data for ${rarityMap.size} NFTs`);

        // Update Redis database
        for (const key of keys) {
            try {
                const mint = key.split(':')[2];
                const rarityData = rarityMap.get(mint);
                
                if (rarityData) {
                    // Only update rarity fields, preserve other data
                    await redis.hset(key, {
                        rarity: rarityData.rank.toString(),
                        rankAlgo: rarityData.rankAlgo
                    });
                    updated++;
                    
                    if (updated % 100 === 0) {
                        console.log(`Updated ${updated} NFTs...`);
                    }
                } else {
                    failed++;
                }
            } catch (error) {
                console.error(`Error updating NFT ${key}:`, error);
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
updateCatzRarity();