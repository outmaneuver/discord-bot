import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { redis } from '../config/redis.js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const COLLECTION_ADDRESS = process.env.COLLECTION_ADDRESS_FCKED_CATZ;
const METADATA_PROGRAM_ID = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

async function initializeCatzDatabase() {
    try {
        console.log('Starting Fcked Catz database initialization...');
        const connection = new Connection(process.env.SOLANA_RPC_URL);
        
        // Get all token accounts for the collection
        const tokenAccounts = await connection.getParsedProgramAccounts(
            TOKEN_PROGRAM_ID,
            {
                filters: [
                    {
                        memcmp: {
                            offset: 0,
                            bytes: COLLECTION_ADDRESS
                        }
                    }
                ]
            }
        );

        console.log(`Found ${tokenAccounts.value.length} Fcked Catz tokens`);
        const multi = redis.multi();

        for (const account of tokenAccounts.value) {
            const { mint, owner } = account.account.data.parsed.info;
            
            // Get metadata for NFT number
            const [metadataPDA] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from('metadata'),
                    new PublicKey(METADATA_PROGRAM_ID).toBuffer(),
                    new PublicKey(mint).toBuffer(),
                ],
                new PublicKey(METADATA_PROGRAM_ID)
            );

            try {
                const metadata = await connection.getAccountInfo(metadataPDA);
                const nftNumber = extractNftNumber(metadata); // We'll implement this
                const imageUrl = `https://buxdao-verify-d1faffc83da7.herokuapp.com/catz/${nftNumber}.png`;

                // Store NFT data
                multi.hset(`nft:fcked_catz:${mint}`, {
                    owner,
                    tokenId: nftNumber,
                    imageUrl,
                    lastPrice: '0',
                    lastSaleDate: '0'
                });

                // Add to owner's NFT set
                multi.sadd(`wallet:${owner}:nfts`, mint);
                
                // Increment holder count
                multi.hincrby('collection:fcked_catz:holders', owner, 1);

                // Add to collection NFT set
                multi.sadd('collection:fcked_catz:nfts', mint);

                // Store NFT number to mint mapping
                multi.set(`fcked_catz:number:${nftNumber}`, mint);

                console.log(`Processed Fcked Catz #${nftNumber} - ${mint} owned by ${owner}`);
            } catch (error) {
                console.error(`Error processing metadata for ${mint}:`, error);
                continue;
            }

            // Add delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Initialize collection stats
        multi.hset('collection:fcked_catz:stats', {
            totalSupply: tokenAccounts.value.length,
            floorPrice: '0',
            totalVolume: '0',
            totalSales: '0',
            lastUpdated: Date.now().toString()
        });

        console.log('Executing database updates...');
        await multi.exec();
        console.log('Fcked Catz database initialized successfully');

    } catch (error) {
        console.error('Error initializing Fcked Catz database:', error);
        throw error;
    }
}

function extractNftNumber(metadata) {
    // Implementation depends on metadata format
    // We'll need to decode the metadata buffer and extract the number
    // This is a placeholder - need actual metadata structure
    try {
        const nameStr = metadata.data.toString().split('Fcked Catz #')[1];
        return nameStr.split('"')[0];
    } catch (error) {
        console.error('Error extracting NFT number:', error);
        return null;
    }
}

// Run the initialization
initializeCatzDatabase()
    .then(() => {
        console.log('Database initialization complete');
        process.exit(0);
    })
    .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    }); 