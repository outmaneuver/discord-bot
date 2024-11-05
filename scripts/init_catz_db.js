import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Configure Redis with proper SSL settings
const redis = new Redis(process.env.REDIS_URL, {
    tls: {
        rejectUnauthorized: false,
        requestCert: true,
        ca: null
    },
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: null
});

redis.on('error', (error) => {
    console.error('Redis connection error:', error);
});

redis.on('connect', () => {
    console.log('Redis connected successfully');
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function initializeCatzDatabase() {
    try {
        console.log('Starting Fcked Catz database initialization...');
        
        // Load hashlist directly
        const hashlistPath = path.join(__dirname, '..', 'config', 'hashlists', 'fcked_catz.json');
        const hashlist = JSON.parse(fs.readFileSync(hashlistPath, 'utf8'));
        
        console.log(`Found ${hashlist.length} Fcked Catz tokens in hashlist`);
        const connection = new Connection(process.env.SOLANA_RPC_URL);
        
        // Clear existing data
        const keys = await redis.keys('nft:fcked_catz:*');
        if (keys.length > 0) {
            await redis.del(keys);
        }
        await redis.del('collection:fcked_catz:holders');
        
        let processed = 0;
        
        for (const mint of hashlist) {
            try {
                // Get current owner
                const tokenAccounts = await connection.getParsedTokenAccountsByMint(
                    new PublicKey(mint),
                    { programId: TOKEN_PROGRAM_ID }
                );

                const owner = tokenAccounts.value.find(
                    account => parseInt(account.account.data.parsed.info.tokenAmount.amount) > 0
                )?.account.data.parsed.info.owner;

                if (owner) {
                    // Store NFT data
                    await redis.hset(`nft:fcked_catz:${mint}`, {
                        owner,
                        tokenId: processed + 1,
                        lastPrice: '0',
                        lastSaleDate: '0'
                    });

                    // Increment holder count
                    await redis.hincrby('collection:fcked_catz:holders', owner, 1);

                    processed++;
                    if (processed % 100 === 0) {
                        console.log(`Processed ${processed}/${hashlist.length} NFTs`);
                    }
                }

                // Add delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 250));

            } catch (error) {
                console.error(`Error processing mint ${mint}:`, error);
                continue;
            }
        }

        console.log('Fcked Catz database initialized successfully');
        console.log(`Total NFTs processed: ${processed}`);
        
        await redis.quit();
        process.exit(0);

    } catch (error) {
        console.error('Error initializing Fcked Catz database:', error);
        await redis.quit();
        process.exit(1);
    }
}

// Run the initialization
initializeCatzDatabase();