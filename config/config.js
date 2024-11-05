// Create a centralized config file
export const config = {
  redis: {
    url: process.env.REDIS_URL
  },
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    guildId: process.env.GUILD_ID
  },
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL,
    buxMint: process.env.BUX_TOKEN_MINT
  }
};

// Add validation for required environment variables
const requiredEnvVars = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'REDIS_URL',
  'SOLANA_RPC_URL'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
