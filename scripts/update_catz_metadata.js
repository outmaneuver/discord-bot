import Redis from 'ioredis';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const redis = new Redis(process.env.REDIS_URL);
const BATCH_SIZE = 20;
const BATCH_DELAY = 2000;

async function getMetadataFromME(mint) {
    try {
        const response = await fetch(`https://api-mainnet.magiceden.dev/v2/tokens/${mint}`);
        
        if (!response.ok) {
            if (response.status === 429) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                return getMetadataFromME(mint); // Retry once
            }
            throw new Error(`Magic Eden API error: ${response.status}`);
        }

        const data = await response.json();
        return {
            number: parseInt(data.name.split('#')[1]),
            image: data.image,
            attributes: data.attributes,
            name: data.name
        };
    } catch (error) {
        console.error(`Error fetching metadata for ${mint}:`, error);
        throw error;
    }
}

async function updateCatzMetadata() {
    try {
        console.log('Starting Fcked Catz metadata update...');
        
        // Get all NFT keys from Redis
        const keys = await redis.keys('nft:fcked_catz:*');
        console.log(`Found ${keys.length} NFTs in database`);
        
        let updated = 0;
        let failed = 0;
        
        // Process in batches
        for (let i = 0; i < keys.length; i += BATCH_SIZE) {
            const batch = keys.slice(i, i + BATCH_SIZE);
            console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(keys.length/BATCH_SIZE)}`);
            
            for (const key of batch) {
                try {
                    const mint = key.split(':')[2];
                    const metadata = await getMetadataFromME(mint);
                    
                    if (metadata) {
                        // Update NFT data with correct metadata
                        await redis.hset(key, {
                            tokenId: metadata.number.toString(),
                            image: metadata.image,
                            traits: JSON.stringify(metadata.attributes)
                        });

                        updated++;
                        console.log(`Updated ${metadata.name} with correct metadata`);
                    } else {
                        failed++;
                        console.log(`No metadata found for ${mint}`);
                    }
                } catch (error) {
                    console.error(`Failed to update metadata for ${key}:`, error);
                    failed++;
                }
                
                // Add delay between NFTs
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Add delay between batches
            if (i + BATCH_SIZE < keys.length) {
                console.log(`Waiting ${BATCH_DELAY}ms before next batch...`);
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }
        }

        console.log('\nMetadata update completed');
        console.log(`Updated: ${updated}`);
        console.log(`Failed: ${failed}`);
        
        await redis.quit();
        process.exit(0);

    } catch (error) {
        console.error('Error updating metadata:', error);
        await redis.quit();
        process.exit(1);
    }
}

// Run the update
updateCatzMetadata(); 