import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const BUX_TOKEN_ADDRESS = 'FMiRxSbLqRTWiBszt1DZmXd7SrscWCccY7fcXNtwWxHK';
const BUX_DECIMALS = 9;

const EXEMPT_WALLETS = [
    'DXM1SKEbtDVFJcqLDJvSBSh83CeHkYv4qM88JG9BwJ5t',
    'BX1PEe4FJiWuHjFnYuYFB8edZsFg39BWggi65yTH52or',
    '95vRUfprVqvURhPryNdEsaBrSNmbE1uuufYZkyrxyjir',
    'FFfTserUJGZEFLKB7ffqxaXvoHfdRJDtNYgXu7NEn8an',
    'He7HLAH2v8pnVafzxmfkqZUVefy4DUGiHmpetQFZNjrg',
    'FAEjAsCtpoapdsCF1DDhj71vdjQjSeAJt8gt9uYxL7gz',
    '9pRsKWUw2nQBfdVhfknyWQ4KEiDiYvahRXCf9an4kpW4',
    'FYfLzXckAf2JZoMYBz2W4fpF9vejqpA6UFV17d1A7C75',
    'H4RPEi5Sfpapy1B233b4DUhh6hsmFTTKx4pXqWnpW637'
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

export async function fetchBuxPublicSupply() {
    try {
        const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
        
        // Get token supply (this already comes in the correct decimal format)
        const tokenSupply = await retryWithBackoff(() => 
            connection.getTokenSupply(new PublicKey(BUX_TOKEN_ADDRESS))
        );

        // Get balances of exempt wallets with delay between requests
        const exemptBalances = [];
        for (const wallet of EXEMPT_WALLETS) {
            try {
                await sleep(500);
                const tokenAccounts = await retryWithBackoff(() =>
                    connection.getTokenAccountsByOwner(
                        new PublicKey(wallet),
                        { programId: TOKEN_PROGRAM_ID }
                    )
                );

                let walletBalance = 0;
                for (const account of tokenAccounts.value) {
                    await sleep(200);
                    const accountInfo = await retryWithBackoff(() =>
                        connection.getTokenAccountBalance(account.pubkey)
                    );
                    // Use uiAmount which is already adjusted for decimals
                    if (accountInfo.value.uiAmount) {
                        walletBalance += accountInfo.value.uiAmount;
                    }
                }
                exemptBalances.push(walletBalance);
                console.log(`Balance for ${wallet}: ${walletBalance.toLocaleString()} BUX`);
            } catch (error) {
                console.error(`Error fetching balance for wallet ${wallet}:`, error);
                exemptBalances.push(0);
            }
        }

        // Calculate total exempt balance
        const totalExemptBalance = exemptBalances.reduce((acc, curr) => acc + curr, 0);

        // Calculate public supply
        const publicSupply = tokenSupply.value.uiAmount - totalExemptBalance;

        console.log('Total Supply:', tokenSupply.value.uiAmount.toLocaleString(), 'BUX');
        console.log('Total Exempt Balance:', totalExemptBalance.toLocaleString(), 'BUX');
        console.log('Public Supply:', publicSupply.toLocaleString(), 'BUX');

        return Math.max(0, publicSupply); // Ensure we never return negative supply
    } catch (error) {
        console.error('Error fetching BUX public supply:', error);
        throw error;
    }
} 