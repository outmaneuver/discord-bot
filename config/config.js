// Create a centralized config file
export const config = {
  redis: {
    url: process.env.REDIS_URL,
    options: {
      tls: { rejectUnauthorized: false }
    }
  },
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.GUILD_ID
  },
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL,
    buxMint: process.env.BUX_TOKEN_MINT
  }
};
