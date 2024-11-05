# BUXDAO Discord Bot

This repository contains the BUXDAO Discord Bot, which provides various functionalities for the BUXDAO community. This README file provides instructions on how to run the project, details about the environment variables, and a list of dependencies.

## Running the Project

To run the project, you can use the following scripts from the `package.json` file:

### Start Script

To start the project in production mode, use the following command:

```bash
npm run start
```

This will run the project using the `start` script defined in `package.json`.

### Development Script

To start the project in development mode with automatic restarts on file changes, use the following command:

```bash
npm run dev
```

This will run the project using the `dev` script defined in `package.json`.

## Procfile

The `Procfile` is used to specify the command that should be run to start the project on Heroku. It contains the following line:

```
web: node main.js
```

This tells Heroku to run the `main.js` file using Node.js when starting the web process.

## Environment Variables

The project uses various environment variables for configuration. Here are the required environment variables and their descriptions:

- `DISCORD_TOKEN`: The token for the Discord bot.
- `DISCORD_CLIENT_ID`: The client ID for the Discord bot.
- `DISCORD_CLIENT_SECRET`: The client secret for the Discord bot.
- `REDIS_URL`: The URL for the Redis instance.
- `SOLANA_RPC_URL`: The URL for the Solana RPC endpoint.
- `GUILD_ID`: The ID of the Discord guild (server).
- `NFT_ACTIVITY_CHANNEL_ID`: The ID of the channel for NFT activity notifications.
- `BUX_ACTIVITY_CHANNEL_ID`: The ID of the channel for BUX activity notifications.
- `SESSION_SECRET`: The secret key for session encryption.

## Dependencies

The project includes the following dependencies and devDependencies:

### Dependencies

- `@metaplex-foundation/js`: ^0.19.5
- `@solana/spl-token`: ^0.3.8
- `@solana/web3.js`: ^1.87.0
- `borsh`: ^2.0.0
- `connect-redis`: ^7.0.0
- `cors`: ^2.8.5
- `discord.js`: ^14.16.3
- `dotenv`: ^16.4.5
- `express`: ^4.17.1
- `express-rate-limit`: ^6.7.0
- `express-session`: ^1.17.3
- `helmet`: ^6.0.0
- `ioredis`: ^5.3.2
- `node-fetch`: ^3.3.2
- `passport`: ^0.6.0
- `passport-discord`: ^0.1.4
- `puppeteer`: ^23.6.1
- `redis`: ^4.6.10
- `ws`: ^8.18.0
- `cookie-parser`: ^1.4.6
- `winston`: ^3.11.0

### DevDependencies

- `eslint`: ^8.40.0
- `nodemon`: ^3.1.7

## Buildpacks

The project uses the following buildpacks for Heroku:

- `jontewks/puppeteer`
