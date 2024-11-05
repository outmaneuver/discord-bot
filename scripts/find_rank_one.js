import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redis = new Redis(process.env.REDIS_URL);

async function findRankOne() {
    try {
        console.log('Searching for NFT with rarity rank 1...');
        
        // Get all NFT keys
        const keys = await redis.keys('nft:fcked_catz:*');
        console.log(`Found ${keys.length} NFTs in database`);
        
        // Check each NFT's rarity
        for (const key of keys) {
            const data = await redis.hgetall(key);
            if (data.rarity === '1') {
                console.log('\nFound NFT with rarity rank 1:');
                console.log('--------------------');
                console.log('Mint:', key.split(':')[2]);
                console.log('Token ID:', data.tokenId);
                console.log('Owner:', data.owner);
                console.log('Image:', data.image);
                if (data.traits) {
                    console.log('\nTraits:');
                    const traits = JSON.parse(data.traits);
                    traits.forEach(t => {
                        console.log(`${t.trait_type}: ${t.value}`);
                    });
                }
                break;
            }
        }
        
        await redis.quit();
        process.exit(0);

    } catch (error) {
        console.error('Error finding rank one:', error);
        await redis.quit();
        process.exit(1);
    }
}

// Run the search
findRankOne(); 