import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redis = new Redis(process.env.REDIS_URL);

const MISSING_NFT = {
    mint: 'EYuctJPZRZ8C4xffzzuYg7FZCzy9EUsGTyLf9LnSW8Rf',
    owner: '7jYPN2o2DgAG1KmCpJWyXsC8pD4uutkCgJv7fipkKYSH'
};

async function addMissingNFT() {
    try {
        console.log('Adding missing Fcked Catz NFT to database...');
        
        // Get current token count
        const keys = await redis.keys('nft:fcked_catz:*');
        const tokenId = keys.length + 1;
        
        // Store NFT data
        await redis.hset(`nft:fcked_catz:${MISSING_NFT.mint}`, {
            owner: MISSING_NFT.owner,
            tokenId: tokenId.toString(),
            lastPrice: '0',
            lastSaleDate: '0'
        });

        // Increment holder count
        await redis.hincrby('collection:fcked_catz:holders', MISSING_NFT.owner, 1);
        
        // Update collection stats
        const stats = await redis.hgetall('collection:fcked_catz:stats');
        await redis.hset('collection:fcked_catz:stats', {
            ...stats,
            active: parseInt(stats.active || 0) + 1,
            lastUpdated: Date.now()
        });

        console.log('Successfully added missing NFT');
        console.log(`Mint: ${MISSING_NFT.mint}`);
        console.log(`Owner: ${MISSING_NFT.owner}`);
        console.log(`Token ID: ${tokenId}`);
        
        await redis.quit();
        process.exit(0);

    } catch (error) {
        console.error('Error adding missing NFT:', error);
        await redis.quit();
        process.exit(1);
    }
}

// Run the script
addMissingNFT(); 