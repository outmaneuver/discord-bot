import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const BUX_TOKEN_ADDRESS = 'FMiRxSbLqRTWiBszt1DZmXd7SrscWCccY7fcXNtwWxHK';
const COMMUNITY_WALLET = '3WNHW6sr1sQdbRjovhPrxgEJdWASZ43egGWMMNrhgoRR';
const ADDITIONAL_SOL = 17.76;
const BUX_DECIMALS = 9;

const EXEMPT_WALLETS = [
    {
        wallet: 'DXM1SKEbtDVFJcqLDJvSBSh83CeHkYv4qM88JG9BwJ5t',
        tokenAccount: '857soYnFmYzTU9gAuYZATCe1fwozRBVGidzV5vf3X9m3'
    },
    {
        wallet: 'BX1PEe4FJiWuHjFnYuYFB8edZsFg39BWggi65yTH52or',
        tokenAccount: '9PhXMK9MUrx3XHdwnUd8SWCXJMN4dn1t6VphM4ag9S9t'
    },
    {
        wallet: '95vRUfprVqvURhPryNdEsaBrSNmbE1uuufYZkyrxyjir',
        tokenAccount: '5B6wB3PpxVttsUi4511xYRy6giGdHCeGwSLJRY9V1px4'
    },
    {
        wallet: 'FFfTserUJGZEFLKB7ffqxaXvoHfdRJDtNYgXu7NEn8an',
        tokenAccount: '4aCuUNM8fmZ4EJgMSuqAXyB7Nh5oQVeejN2gEdhfmjyB'
    },
    {
        wallet: 'He7HLAH2v8pnVafzxmfkqZUVefy4DUGiHmpetQFZNjrg',
        tokenAccount: 'Jh4BVgcD9Pp3TFJzxxVDeyp1TPUioY3k4cwj7GjaLsJ'
    },
    {
        wallet: 'FAEjAsCtpoapdsCF1DDhj71vdjQjSeAJt8gt9uYxL7gz',
        tokenAccount: 'HyBS72PmHuhwX7Z6qLM9HaLsboKHZy4se27sDMkqEgqd'
    },
    {
        wallet: '9pRsKWUw2nQBfdVhfknyWQ4KEiDiYvahRXCf9an4kpW4',
        tokenAccount: 'CFJdc43HP5q9N9KMkhy9oaoRZKYiAXnEcVmpdYaD1tci'
    },
    {
        wallet: 'FYfLzXckAf2JZoMYBz2W4fpF9vejqpA6UFV17d1A7C75',
        tokenAccount: '2ViuF6cWJ5PH9sXwC8RFK8azwdNEQM4aKnfhF6qUSjNH'
    },
    {
        wallet: 'H4RPEi5Sfpapy1B233b4DUhh6hsmFTTKx4pXqWnpW637',
        tokenAccount: '32B5gWmvmTgASxqdxDhgweo2CdcxVtCkx4t4Y2DTdu1C'
    }
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff(fn, maxRetries = 5) {
    let retries = 0;
    while (true) {
        try {
            return await fn();
        } catch (error) {
            if (!error.message.includes('429 Too Many Requests') || retries >= maxRetries) {
                throw error;
            }
            retries++;
            const delay = Math.min(1000 * Math.pow(2, retries), 10000);
            console.log(`Rate limited, retrying in ${delay}ms...`);
            await sleep(delay);
        }
    }
}

async function getCommunityWalletBalance(connection) {
    try {
        const balance = await retryWithBackoff(() =>
            connection.getBalance(new PublicKey(COMMUNITY_WALLET))
        );
        
        // Convert lamports to SOL and add the additional amount
        const solBalance = (balance / 1e9) + ADDITIONAL_SOL;
        console.log('Community Wallet Balance:', solBalance.toLocaleString(), 'SOL');
        return solBalance;
    } catch (error) {
        console.error('Error fetching community wallet balance:', error);
        return 0;
    }
}

export async function fetchBuxPublicSupply() {
    try {
        const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
        
        // Get token supply and community wallet balance in parallel
        const [tokenSupply, communityWalletSol] = await Promise.all([
            retryWithBackoff(() => connection.getTokenSupply(new PublicKey(BUX_TOKEN_ADDRESS))),
            getCommunityWalletBalance(connection)
        ]);

        // Get balances of exempt wallets with delay between requests
        const exemptBalances = [];
        for (const { wallet, tokenAccount } of EXEMPT_WALLETS) {
            try {
                await sleep(500);
                const accountInfo = await retryWithBackoff(() =>
                    connection.getTokenAccountBalance(new PublicKey(tokenAccount))
                );
                
                const balance = accountInfo.value.uiAmount || 0;
                exemptBalances.push(balance);
                console.log(`Balance for ${wallet}: ${balance.toLocaleString()} BUX`);
            } catch (error) {
                console.error(`Error fetching balance for wallet ${wallet}:`, error);
                exemptBalances.push(0);
            }
        }

        const totalExemptBalance = exemptBalances.reduce((acc, curr) => acc + curr, 0);
        const publicSupply = tokenSupply.value.uiAmount - totalExemptBalance;

        console.log('Total Supply:', tokenSupply.value.uiAmount.toLocaleString(), 'BUX');
        console.log('Total Exempt Balance:', totalExemptBalance.toLocaleString(), 'BUX');
        console.log('Public Supply:', publicSupply.toLocaleString(), 'BUX');
        
        return {
            publicSupply: Math.max(0, publicSupply),
            communityWalletSol
        };
    } catch (error) {
        console.error('Error fetching BUX supply:', error);
        throw error;
    }
} 