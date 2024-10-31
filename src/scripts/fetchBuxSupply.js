const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

const BUX_TOKEN_ADDRESS = 'FMiRxSbLqRTWiBszt1DZmXd7SrscWCccY7fcXNtwWxHK';

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

async function fetchBuxPublicSupply() {
    try {
        // Connect to Solana mainnet
        const connection = new Connection('https://api.mainnet-beta.solana.com');
        
        // Get token supply
        const tokenSupply = await connection.getTokenSupply(
            new PublicKey(BUX_TOKEN_ADDRESS)
        );

        // Get balances of exempt wallets
        const exemptBalances = await Promise.all(
            EXEMPT_WALLETS.map(async (wallet) => {
                try {
                    const tokenAccounts = await connection.getTokenAccountsByOwner(
                        new PublicKey(wallet),
                        { programId: TOKEN_PROGRAM_ID }
                    );

                    let walletBalance = 0;
                    for (const account of tokenAccounts.value) {
                        const accountInfo = await connection.getTokenAccountBalance(account.pubkey);
                        if (accountInfo.value.uiAmount) {
                            walletBalance += accountInfo.value.uiAmount;
                        }
                    }
                    return walletBalance;
                } catch (error) {
                    console.error(`Error fetching balance for wallet ${wallet}:`, error);
                    return 0;
                }
            })
        );

        // Calculate total exempt balance
        const totalExemptBalance = exemptBalances.reduce((acc, curr) => acc + curr, 0);

        // Calculate public supply
        const publicSupply = tokenSupply.value.uiAmount - totalExemptBalance;

        console.log('Total Supply:', tokenSupply.value.uiAmount);
        console.log('Total Exempt Balance:', totalExemptBalance);
        console.log('Public Supply:', publicSupply);

        return publicSupply;
    } catch (error) {
        console.error('Error fetching BUX public supply:', error);
        throw error;
    }
}

module.exports = { fetchBuxPublicSupply }; 