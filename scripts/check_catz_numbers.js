import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redis = new Redis(process.env.REDIS_URL);

async function checkCatzNumbers() {
    try {
        console.log('Checking Fcked Catz token numbers...');
        
        // Get all NFT keys
        const keys = await redis.keys('nft:fcked_catz:*');
        console.log(`Found ${keys.length} NFTs in database`);
        
        // Get a few random entries to check
        const sampleSize = 10;
        const randomKeys = keys.sort(() => 0.5 - Math.random()).slice(0, sampleSize);
        
        console.log('\nSample NFT Data:');
        console.log('--------------------');
        
        for (const key of randomKeys) {
            const data = await redis.hgetall(key);
            console.log(`\nMint: ${key.split(':')[2]}`);
            console.log(`Token ID: ${data.tokenId}`);
            console.log(`Owner: ${data.owner}`);
            console.log(`Rarity: ${data.rarity}`);
        }
        
        // Check for duplicate numbers
        const numberMap = new Map();
        let duplicates = 0;
        
        for (const key of keys) {
            const data = await redis.hgetall(key);
            const tokenId = data.tokenId;
            
            if (numberMap.has(tokenId)) {
                duplicates++;
                console.log(`\nDuplicate found for #${tokenId}:`);
                console.log(`Mint 1: ${numberMap.get(tokenId)}`);
                console.log(`Mint 2: ${key.split(':')[2]}`);
            } else {
                numberMap.set(tokenId, key.split(':')[2]);
            }
        }
        
        console.log('\nSummary:');
        console.log(`Total NFTs: ${keys.length}`);
        console.log(`Duplicate numbers: ${duplicates}`);
        
        await redis.quit();
        process.exit(0);

    } catch (error) {
        console.error('Error checking numbers:', error);
        await redis.quit();
        process.exit(1);
    }
}

// Run the check
checkCatzNumbers(); 