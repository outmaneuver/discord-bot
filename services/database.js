import { redis } from '../config/redis.js';
import { Connection, TOKEN_PROGRAM_ID } from '@solana/web3.js';

class NFTDatabase {
    // Key structure:
    // nft:fcked_catz:{mint} -> { owner, tokenId, lastPrice, lastSaleDate }
    // collection:fcked_catz:holders -> Hash of wallet -> count
    // collection:fcked_catz:stats -> { floorPrice, totalVolume, totalSales }

    constructor() {
        this.COLLECTION_ADDRESS = process.env.COLLECTION_ADDRESS_FCKED_CATZ;
    }

    async initializeFckedCatz() {
        try {
            console.log('Initializing Fcked Catz database...');
            const connection = new Connection(process.env.SOLANA_RPC_URL);
            
            // Get all token accounts for the collection
            const nfts = await connection.getParsedProgramAccounts(
                TOKEN_PROGRAM_ID,
                {
                    filters: [
                        {
                            memcmp: {
                                offset: 0,
                                bytes: this.COLLECTION_ADDRESS
                            }
                        }
                    ]
                }
            );

            const multi = redis.multi();

            for (const nft of nfts) {
                const { mint, owner } = nft.account.data.parsed.info;
                const tokenId = await this.getTokenId(mint);
                
                // Store NFT data
                multi.hset(`nft:fcked_catz:${mint}`, {
                    owner,
                    tokenId,
                    lastPrice: '0',
                    lastSaleDate: '0'
                });

                // Increment holder count
                multi.hincrby('collection:fcked_catz:holders', owner, 1);
            }

            // Initialize collection stats
            multi.hset('collection:fcked_catz:stats', {
                floorPrice: '0',
                totalVolume: '0',
                totalSales: '0'
            });

            await multi.exec();
            console.log('Fcked Catz database initialized');

        } catch (error) {
            console.error('Error initializing Fcked Catz database:', error);
            throw error;
        }
    }

    async updateNFTOwner(mint, newOwner, oldOwner = null) {
        try {
            const multi = redis.multi();

            // Update NFT owner
            multi.hset(`nft:fcked_catz:${mint}`, 'owner', newOwner);

            // Update holder counts
            if (oldOwner) {
                multi.hincrby('collection:fcked_catz:holders', oldOwner, -1);
            }
            multi.hincrby('collection:fcked_catz:holders', newOwner, 1);

            await multi.exec();

            // Emit event for Discord notification
            global.activityService?.postNFTActivity({
                type: oldOwner ? 'transfer' : 'mint',
                collection: 'Fcked Catz',
                mint,
                nftNumber: await this.getTokenId(mint),
                newOwner,
                oldOwner,
                image: `https://buxdao-verify-d1faffc83da7.herokuapp.com/catz/${mint}.png`
            });

        } catch (error) {
            console.error('Error updating NFT owner:', error);
            throw error;
        }
    }

    async getTokenId(mint) {
        // Implementation to get token ID from metadata
        // This will need to be implemented based on your metadata structure
        return '???';
    }

    async getCollectionStats() {
        try {
            const stats = await redis.hgetall('collection:fcked_catz:stats');
            return {
                floorPrice: parseFloat(stats.floorPrice),
                totalVolume: parseFloat(stats.totalVolume),
                totalSales: parseInt(stats.totalSales)
            };
        } catch (error) {
            console.error('Error getting collection stats:', error);
            throw error;
        }
    }

    async getHolderCount(wallet) {
        try {
            const count = await redis.hget('collection:fcked_catz:holders', wallet);
            return parseInt(count || '0');
        } catch (error) {
            console.error('Error getting holder count:', error);
            throw error;
        }
    }
}

export const nftDB = new NFTDatabase(); 