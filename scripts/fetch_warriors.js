import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function getAIWarriorsTokens() {
    try {
        console.log('Fetching from Solana RPC...');
        
        const tokens = new Set();
        
        // Use Solana mainnet RPC with Metaplex program
        const response = await fetch(
            'https://api.mainnet-beta.solana.com',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getProgramAccounts",
                    "params": [
                        "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
                        {
                            "encoding": "base64",
                            "filters": [
                                {
                                    "memcmp": {
                                        "offset": 326,
                                        "bytes": "AiWarhorsVhfssdmzWoE6DXCMwADtJ1KTpSfQXBXYBJQS"
                                    }
                                },
                                {
                                    "memcmp": {
                                        "offset": 358,
                                        "bytes": "1"
                                    }
                                }
                            ]
                        }
                    ]
                })
            }
        );

        if (!response.ok) {
            console.log('RPC request failed, falling back to Magic Eden API');
        } else {
            const data = await response.json();
            console.log('Received data from RPC:', data);

            if (data.result) {
                data.result.forEach(item => {
                    try {
                        // Extract mint address from metadata account
                        const metadata = Buffer.from(item.account.data[0], 'base64');
                        // Mint address is at offset 33
                        const mintAddress = metadata.slice(33, 65).toString('hex');
                        if (mintAddress) {
                            tokens.add(mintAddress);
                        }
                    } catch (error) {
                        console.error('Error parsing account data:', error);
                    }
                });
            }
        }

        // Also try Magic Eden's API
        console.log('Fetching from Magic Eden API...');
        
        // Get all listings with pagination
        let offset = 0;
        const limit = 100;
        let hasMore = true;

        while (hasMore) {
            const meResponse = await fetch(
                `https://api-mainnet.magiceden.dev/v2/collections/ai_warriors/listings?offset=${offset}&limit=${limit}`,
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                    }
                }
            );

            if (meResponse.ok) {
                const listings = await meResponse.json();
                if (listings.length === 0) {
                    hasMore = false;
                    continue;
                }

                listings.forEach(listing => {
                    if (listing.tokenMint) {
                        tokens.add(listing.tokenMint);
                    }
                });

                offset += limit;
                console.log(`Fetched ${listings.length} listings at offset ${offset}`);
                
                // Add a small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            } else {
                hasMore = false;
            }
        }

        // Get activities from Magic Eden with pagination
        offset = 0;
        hasMore = true;

        while (hasMore) {
            const activityResponse = await fetch(
                `https://api-mainnet.magiceden.dev/v2/collections/ai_warriors/activities?offset=${offset}&limit=${limit}`,
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                    }
                }
            );

            if (activityResponse.ok) {
                const activities = await activityResponse.json();
                if (activities.length === 0) {
                    hasMore = false;
                    continue;
                }

                activities.forEach(activity => {
                    if (activity.tokenMint) {
                        tokens.add(activity.tokenMint);
                    }
                });

                offset += limit;
                console.log(`Fetched ${activities.length} activities at offset ${offset}`);
                
                // Add a small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            } else {
                hasMore = false;
            }
        }

        // Get existing tokens from warriors.json
        const filePath = path.join(__dirname, '..', 'config', 'hashlists', 'ai_collabs', 'warriors.json');
        try {
            const existing = JSON.parse(await fs.readFile(filePath, 'utf8'));
            existing.forEach(token => tokens.add(token));
            console.log(`Added ${existing.length} existing tokens`);
        } catch (error) {
            console.log('No existing warriors.json found or error reading it');
        }

        // Convert Set to array and sort
        const uniqueTokens = [...tokens].sort();
        
        // Write to warriors.json
        await fs.writeFile(
            filePath, 
            JSON.stringify(uniqueTokens, null, 2)
        );
        
        console.log(`Saved ${uniqueTokens.length} unique token addresses to warriors.json`);
        console.log(`Missing ${160 - uniqueTokens.length} tokens from total supply of 160`);
        
        if (uniqueTokens.length > 0) {
            console.log('Sample of token addresses:', uniqueTokens.slice(0, 3));
        }
        
        return uniqueTokens;
    } catch (error) {
        console.error('Error fetching tokens:', error);
        throw error;
    }
}

// Run the script
getAIWarriorsTokens()
    .then(() => console.log('Script completed successfully'))
    .catch(error => {
        console.error('Script failed:', error);
        process.exit(1);
    });