import Redis from 'ioredis';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

// Create direct Redis connection with working URL
const redis = new Redis('redis://default:9hCbki3tfd8scLZRTdGbN4FPHwUSLXyH@redis-15042.c82.us-east-1-2.ec2.redns.redis-cloud.com:15042');

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

        // Get all NFT keys
        const keys = await redis.keys('nft:fcked_catz:*');
        console.log(`Found ${keys.length} NFTs in database`);

        let updated = 0;
        let failed = 0;

        // Fetch rarity data in batches
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            try {
                console.log(`Fetching page ${page}...`);
                const rarityData = await fetchRarityData(page);
                
                if (!rarityData || !rarityData.items || rarityData.items.length === 0) {
                    hasMore = false;
                    continue;
                }

                // Update each NFT in this batch
                for (const item of rarityData.items) {
                    try {
                        const key = `nft:fcked_catz:${item.mint}`;
                        await redis.hset(key, {
                            rarity: item.rank.toString(),
                            rankAlgo: 'howrare.is'
                        });
                        updated++;
                        console.log(`Updated rarity for ${item.mint} to rank ${item.rank}`);
                    } catch (error) {
                        console.error(`Failed to update ${item.mint}:`, error);
                        failed++;
                    }
                }

                page++;
                // Add delay between batches
                await new Promise(resolve => setTimeout(resolve, 2000));

            } catch (error) {
                console.error(`Error processing page ${page}:`, error);
                failed++;
                hasMore = false;
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