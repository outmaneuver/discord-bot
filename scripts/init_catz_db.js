import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { redis } from '../config/redis.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load Fcked Catz hashlist
const hashlistPath = path.join(__dirname, '..', 'config', 'hashlists', 'fcked_catz.json');
const hashlist = JSON.parse(fs.readFileSync(hashlistPath, 'utf8'));

async function initializeCatzDatabase() {
    try {
        console.log('Starting Fcked Catz database initialization...');
        const connection = new Connection(process.env.SOLANA_RPC_URL);
        
        // Clear existing data
        const keys = await redis.keys('nft:fcked_catz:*');
        if (keys.length > 0) {
            await redis.del(keys);
        }
        await redis.del('collection:fcked_catz:holders');
        
        console.log(`Processing ${hashlist.length} Fcked Catz NFTs...`);
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
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
                console.error(`Error processing mint ${mint}:`, error);
                continue;
            }
        }

        console.log('Fcked Catz database initialized successfully');
        console.log(`Total NFTs processed: ${processed}`);
        process.exit(0);

    } catch (error) {
        console.error('Error initializing Fcked Catz database:', error);
        process.exit(1);
    }
}

// Run the initialization
initializeCatzDatabase(); 