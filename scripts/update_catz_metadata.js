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

async function fetchMetadata(mint) {
    try {
        const response = await fetch(`https://api-mainnet.magiceden.dev/v2/tokens/${mint}`);
        
        if (!response.ok) {
            throw new Error(`Magic Eden API error: ${response.status}`);
        }

        const data = await response.json();
        return data;
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

        for (const key of keys) {
            try {
                const mint = key.split(':')[2];
                console.log(`Fetching metadata for ${mint}...`);

                const metadata = await fetchMetadata(mint);
                
                if (metadata) {
                    // Store metadata fields
                    await redis.hset(key, {
                        name: metadata.name,
                        image: metadata.image,
                        traits: JSON.stringify(metadata.attributes)
                    });
                    updated++;
                    console.log(`Updated metadata for ${mint}`);
                } else {
                    failed++;
                    console.error(`No metadata found for ${mint}`);
                }

                // Add delay between requests
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                console.error(`Error processing NFT:`, error);
                failed++;
            }
        }

        console.log('Metadata update completed');
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