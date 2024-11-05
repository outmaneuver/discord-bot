import Redis from 'ioredis';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

dotenv.config();

const redis = new Redis(process.env.REDIS_URL);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function checkTokenOwner(mint) {
    try {
        const response = await fetch(`https://api-mainnet.magiceden.dev/v2/tokens/${mint}`);
        
        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data.owner || null;
    } catch (error) {
        console.error(`Error checking token ${mint}:`, error);
        return null;
    }
}

async function findMissingCatz() {
    try {
        console.log('Starting Fcked Catz audit...');
        
        // Load hashlist
        const hashlistPath = path.join(__dirname, '..', 'config', 'hashlists', 'fcked_catz.json');
        const hashlist = new Set(JSON.parse(fs.readFileSync(hashlistPath, 'utf8')));
        
        console.log(`Found ${hashlist.size} Fcked Catz tokens in hashlist`);
        
        // Get all NFTs from database
        const keys = await redis.keys('nft:fcked_catz:*');
        const dbMints = new Set(keys.map(key => key.split(':')[2]));
        
        console.log(`Found ${dbMints.size} Fcked Catz tokens in database`);
        
        // Find missing mints
        const missingMints = [...hashlist].filter(mint => !dbMints.has(mint));
        const extraMints = [...dbMints].filter(mint => !hashlist.has(mint));
        
        console.log('\nChecking missing mints for active tokens...');
        
        // Check each missing mint
        for (const mint of missingMints) {
            const owner = await checkTokenOwner(mint);
            if (owner) {
                console.log('\nFOUND ACTIVE TOKEN:');
                console.log('Mint:', mint);
                console.log('Owner:', owner);
            }
            // Add small delay between checks
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log('\nAudit Results:');
        console.log('--------------------');
        console.log(`Total Missing Mints: ${missingMints.length}`);
        console.log(`Extra Mints: ${extraMints.length}`);
        
        await redis.quit();
        process.exit(0);

    } catch (error) {
        console.error('Error during audit:', error);
        await redis.quit();
        process.exit(1);
    }
}

// Run the audit
findMissingCatz();