import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redis = new Redis(process.env.REDIS_URL);

// Test NFT mint address - let's check one we know exists
const TEST_MINT = 'EYuctJPZRZ8C4xffzzuYg7FZCzy9EUsGTyLf9LnSW8Rf';

async function checkNFTEntry() {
    try {
        console.log('Checking Fcked Catz NFT entry...');
        
        // Get NFT data
        const nftData = await redis.hgetall(`nft:fcked_catz:${TEST_MINT}`);
        
        if (Object.keys(nftData).length === 0) {
            console.log('No data found for this NFT');
            process.exit(1);
        }

        console.log('\nNFT Data:');
        console.log('--------------------');
        console.log('Mint:', TEST_MINT);
        console.log('Owner:', nftData.owner);
        console.log('Token ID:', nftData.tokenId);
        console.log('Rarity Rank:', nftData.rarity || 'Not set');
        console.log('Image:', nftData.image || 'Not set');
        
        if (nftData.traits) {
            console.log('\nTraits:');
            const traits = JSON.parse(nftData.traits);
            traits.forEach(trait => {
                console.log(`${trait.trait_type}: ${trait.value}`);
            });
        } else {
            console.log('\nNo traits stored');
        }
        
        await redis.quit();
        process.exit(0);

    } catch (error) {
        console.error('Error checking NFT entry:', error);
        await redis.quit();
        process.exit(1);
    }
}

// Run the check
checkNFTEntry(); 