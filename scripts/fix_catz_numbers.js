import Redis from 'ioredis';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const redis = new Redis(process.env.REDIS_URL);
const BATCH_SIZE = 20;
const BATCH_DELAY = 2000;

async function getCorrectTokenNumber(mint) {
    try {
        const response = await fetch(`https://api-mainnet.magiceden.dev/v2/tokens/${mint}`);
        
        if (!response.ok) {
            if (response.status === 429) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                return getCorrectTokenNumber(mint); // Retry once
            }
            throw new Error(`Magic Eden API error: ${response.status}`);
        }

        const data = await response.json();
        const number = parseInt(data.name.split('#')[1]);
        return isNaN(number) ? null : number;
    } catch (error) {
        console.error(`Error fetching token ${mint}:`, error);
        return null;
    }
}

async function fixCatzNumbers() {
    try {
        console.log('Starting Fcked Catz number fix...');
        
        // Get all NFT keys
        const keys = await redis.keys('nft:fcked_catz:*');
        console.log(`Found ${keys.length} NFTs in database`);
        
        let updated = 0;
        let failed = 0;
        let numberMap = new Map();
        
        // Process in batches
        for (let i = 0; i < keys.length; i += BATCH_SIZE) {
            const batch = keys.slice(i, i + BATCH_SIZE);
            console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(keys.length/BATCH_SIZE)}`);
            
            for (const key of batch) {
                try {
                    const mint = key.split(':')[2];
                    const correctNumber = await getCorrectTokenNumber(mint);
                    
                    if (correctNumber) {
                        // Update NFT data with correct number
                        await redis.hset(key, 'tokenId', correctNumber.toString());
                        numberMap.set(correctNumber, mint);
                        updated++;
                        console.log(`Fixed ${mint} to #${correctNumber}`);
                    } else {
                        failed++;
                        console.log(`Could not get number for ${mint}`);
                    }
                } catch (error) {
                    console.error(`Failed to fix number for ${key}:`, error);
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

        console.log('\nNumber fix completed');
        console.log(`Updated: ${updated}`);
        console.log(`Failed: ${failed}`);
        
        await redis.quit();
        process.exit(0);

    } catch (error) {
        console.error('Error fixing numbers:', error);
        await redis.quit();
        process.exit(1);
    }
}

// Run the fix
fixCatzNumbers(); 