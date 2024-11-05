import Redis from 'ioredis';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

dotenv.config();

const redis = new Redis(process.env.REDIS_URL);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Collection constants
const EXPECTED_TOTAL = 1231; // Total expected active NFTs
const BATCH_SIZE = 20;
const BATCH_DELAY = 2000;

async function getTokenOwner(mint) {
    try {
        const response = await fetch(`https://api-mainnet.magiceden.dev/v2/tokens/${mint}/listings`);
        
        if (!response.ok) {
            if (response.status === 429) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                return getTokenOwner(mint); // Retry once
            }
            throw new Error(`Magic Eden API error: ${response.status}`);
        }

        const data = await response.json();
        if (data && data.owner) {
            return data.owner;
        }

        // If no listing found, try getting token info
        const infoResponse = await fetch(`https://api-mainnet.magiceden.dev/v2/tokens/${mint}`);
        if (!infoResponse.ok) {
            throw new Error(`Magic Eden API error: ${infoResponse.status}`);
        }

        const infoData = await infoResponse.json();
        return infoData.owner || null;

    } catch (error) {
        console.error(`Error fetching token ${mint}:`, error);
        throw error;
    }
}

async function initializeCatzDatabase() {
    try {
        console.log('Starting Fcked Catz database initialization...');
        
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
        await redis.del('collection:fcked_catz:holders');
        await redis.del('collection:fcked_catz:stats');
        
        let processed = 0;
        let failedMints = [];
        let uniqueHolders = new Set();
        
        // Process tokens
        for (const mint of hashlist) {
            try {
                const owner = await getTokenOwner(mint);
                
                if (owner) {
                    // Store NFT data
                    await redis.hset(`nft:fcked_catz:${mint}`, {
                        owner,
                        tokenId: processed + 1,
                        lastPrice: '0',
                        lastSaleDate: '0'
                    });

                    uniqueHolders.add(owner);
                    await redis.hincrby('collection:fcked_catz:holders', owner, 1);
                    processed++;
                    
                    console.log(`Processed Fcked Catz #${processed} - Owner: ${owner}`);
                } else {
                    failedMints.push(mint);
                }
            } catch (error) {
                console.error(`Failed to process ${mint}:`, error);
                failedMints.push(mint);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Validate total count
        if (processed !== EXPECTED_TOTAL) {
            console.error(`WARNING: Processed ${processed} NFTs but expected ${EXPECTED_TOTAL}`);
            console.error('Please verify the data and try again if needed');
        }

        // Store collection stats
        await redis.hset('collection:fcked_catz:stats', {
            totalSupply: hashlist.length,
            active: processed,
            burned: failedMints.length,
            uniqueHolders: uniqueHolders.size,
            lastUpdated: Date.now()
        });

        console.log('Fcked Catz database initialized successfully');
        console.log(`Total NFTs processed: ${processed}`);
        console.log(`Unique holders: ${uniqueHolders.size}`);
        console.log(`Burned NFTs: ${failedMints.length}`);
        
        if (failedMints.length > 0) {
            // Store burned mints for reference
            await redis.sadd('collection:fcked_catz:burned', ...failedMints);
            console.log('Failed mint addresses:', failedMints);
        }
        
        await redis.quit();
        process.exit(processed === EXPECTED_TOTAL ? 0 : 1);

    } catch (error) {
        console.error('Error initializing Fcked Catz database:', error);
        await redis.quit();
        process.exit(1);
    }
}

// Run the initialization
initializeCatzDatabase();