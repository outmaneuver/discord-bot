import Redis from 'ioredis';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const redis = new Redis(process.env.REDIS_URL);

const MISSING_NFT = {
    mint: 'EYuctJPZRZ8C4xffzzuYg7FZCzy9EUsGTyLf9LnSW8Rf'
};

async function fetchRarityData() {
    try {
        const response = await fetch(
            `https://api.howrare.is/v0.1/collections/fckedcatz/only_rarity`
        );

        if (!response.ok) {
            throw new Error(`HowRare API error: ${response.status}`);
        }

        const data = await response.json();
        return data.result.data.items.find(item => item.mint === MISSING_NFT.mint);
    } catch (error) {
        console.error('Error fetching rarity data:', error);
        throw error;
    }
}

async function addMissingRarity() {
    try {
        console.log('Adding rarity data for missing Fcked Catz NFT...');
        
        const rarityData = await fetchRarityData();
        
        if (rarityData) {
            await redis.hset(`nft:fcked_catz:${MISSING_NFT.mint}`, {
                rarity: rarityData.rank.toString(),
                rankAlgo: rarityData.rank_algo
            });

            console.log('Successfully added rarity data');
            console.log(`Mint: ${MISSING_NFT.mint}`);
            console.log(`Rank: ${rarityData.rank}`);
            console.log(`Algorithm: ${rarityData.rank_algo}`);
        } else {
            console.log('No rarity data found for mint:', MISSING_NFT.mint);
        }
        
        await redis.quit();
        process.exit(0);

    } catch (error) {
        console.error('Error adding rarity data:', error);
        await redis.quit();
        process.exit(1);
    }
}

// Run the script
addMissingRarity(); 