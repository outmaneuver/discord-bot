import { redis } from '../config/redis.js';

// Keys structure:
// nft:{mintAddress} -> { owner, collection }
// wallet:{address}:nfts -> Set of mint addresses
// wallet:{address}:bux -> BUX balance
// collection:{name}:holders -> Hash of wallet -> count

class TokenDatabase {
    // Update NFT ownership
    async updateNFTOwnership(mintAddress, newOwner, collection, oldOwner = null) {
        try {
            const multi = redis.multi();

            // Update NFT owner
            multi.hset(`nft:${mintAddress}`, {
                owner: newOwner,
                collection: collection
            });

            // Add to new owner's NFTs
            multi.sadd(`wallet:${newOwner}:nfts`, mintAddress);

            // Remove from old owner's NFTs if exists
            if (oldOwner) {
                multi.srem(`wallet:${oldOwner}:nfts`, mintAddress);
                multi.hincrby(`collection:${collection}:holders`, oldOwner, -1);
            }

            // Update collection holder count
            multi.hincrby(`collection:${collection}:holders`, newOwner, 1);

            await multi.exec();

            // Emit event for Discord notification
            this.emitNFTActivity({
                type: oldOwner ? 'transfer' : 'mint',
                mint: mintAddress,
                newOwner,
                oldOwner,
                collection
            });

        } catch (error) {
            console.error('Error updating NFT ownership:', error);
            throw error;
        }
    }

    // Update BUX balance
    async updateBUXBalance(wallet, newBalance, oldBalance = null) {
        try {
            await redis.set(`wallet:${wallet}:bux`, newBalance);

            // Emit event for Discord notification
            this.emitBUXActivity({
                type: 'transfer',
                wallet,
                newBalance,
                oldBalance,
                change: oldBalance ? newBalance - oldBalance : newBalance
            });

        } catch (error) {
            console.error('Error updating BUX balance:', error);
            throw error;
        }
    }

    // Get wallet's NFT holdings
    async getWalletNFTs(wallet) {
        try {
            const nftCounts = {
                fcked_catz: 0,
                celebcatz: 0,
                money_monsters: 0,
                money_monsters3d: 0,
                ai_bitbots: 0,
                warriors: 0,
                squirrels: 0,
                rjctd_bots: 0,
                energy_apes: 0,
                doodle_bots: 0,
                candy_bots: 0
            };

            // Get all NFTs owned by wallet
            const nftMints = await redis.smembers(`wallet:${wallet}:nfts`);

            // Get collection info for each NFT
            for (const mint of nftMints) {
                const nftInfo = await redis.hgetall(`nft:${mint}`);
                if (nftInfo.collection) {
                    nftCounts[nftInfo.collection]++;
                }
            }

            return nftCounts;

        } catch (error) {
            console.error('Error getting wallet NFTs:', error);
            throw error;
        }
    }

    // Get wallet's BUX balance
    async getWalletBUXBalance(wallet) {
        try {
            const balance = await redis.get(`wallet:${wallet}:bux`);
            return balance ? parseInt(balance) : 0;
        } catch (error) {
            console.error('Error getting BUX balance:', error);
            throw error;
        }
    }

    // Event emitters for Discord notifications
    emitNFTActivity(event) {
        // Implementation for Discord NFT activity channel
    }

    emitBUXActivity(event) {
        // Implementation for Discord BUX activity channel
    }
}

export const tokenDB = new TokenDatabase(); 