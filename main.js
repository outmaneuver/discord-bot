import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import session from 'express-session';
import authRouter from './routes/auth.js';
import RedisStore from 'connect-redis';
import { redis } from './config/redis.js';
import { config } from './config/config.js';
import { promises as fs } from 'fs';
import cookieParser from 'cookie-parser';

import { 
  verifyHolder, 
  updateDiscordRoles,
  updateHashlists,
  getBUXBalance,
  hashlists 
} from './services/verify.js';

import { 
  updateUserProfile, 
  getWalletData,
  displayWallets,
  displayNFTs,
  displayRoles,
  displayBuxInfo,
  displayHelp,
  displayCatzInfo,
  displayMMInfo,
  displayMM3DInfo,
  displayCelebInfo,
  displayBitbotsInfo,
  displayRewards,
  displayBuxBalance,
  displayTestEmbed
} from './services/profile.js';

import verifyRouter from './routes/verify.js';

// Initialize hashlists with all collections
let hashlistsData = {
  fckedCatz: new Set(),
  celebCatz: new Set(),
  moneyMonsters: new Set(),
  moneyMonsters3d: new Set(),
  aiBitbots: new Set(),
  warriors: new Set(),
  squirrels: new Set(),
  rjctdBots: new Set(),
  energyApes: new Set(),
  doodleBots: new Set(),
  candyBots: new Set(),
  mmTop10: new Set(),
  mm3dTop10: new Set()
};

// Function to load hashlist from JSON file
async function loadHashlist(filename) {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    let filePath;
    
    // Handle AI collabs subdirectory
    if (filename.startsWith('ai_collabs/')) {
      filePath = path.join(__dirname, 'config', 'hashlists', filename);
    } else {
      filePath = path.join(__dirname, 'config', 'hashlists', filename);
    }
    
    console.log('Loading hashlist:', filePath);
    const data = await fs.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(data);
    
    // Handle different JSON structures
    const addresses = Array.isArray(jsonData) ? jsonData : 
                     jsonData.mints || jsonData.addresses || 
                     Object.keys(jsonData);
                     
    console.log(`Loaded ${addresses.length} addresses from ${filename}`);
    return new Set(addresses);
  } catch (error) {
    console.error(`Error loading hashlist ${filename}:`, error);
    return new Set();
  }
}

// Main application startup function
async function startApp() {
  try {
    // Get port from environment first
    const port = process.env.PORT || 3000;
    const app = express();
    
    // Initialize Express app with middleware
    app.use(cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
    }));
    app.use(express.json());
    console.log('Express app created');

    // Configure Redis store
    const redisStore = new RedisStore({
      client: redis,
      prefix: 'session:'
    });

    // Add cookie-parser before session middleware
    app.use(cookieParser());

    // Add session middleware
    app.use(session({
      store: redisStore,
      secret: process.env.SESSION_SECRET || 'your-secret-key',
      resave: false,
      saveUninitialized: false,
      name: 'buxdao.sid',
      proxy: true,
      cookie: {
        secure: true,
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'lax',
        path: '/'
      }
    }));

    // Add session debug middleware
    app.use((req, res, next) => {
      console.log('Session Debug:', {
        id: req.sessionID,
        user: req.session?.user,
        cookies: req.cookies
      });
      next();
    });

    // Add trust proxy setting
    app.set('trust proxy', 1);

    // Serve static files first
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    app.use(express.static(path.join(__dirname, 'public')));
    app.use('/holder-verify', express.static(path.join(__dirname, 'public')));

    // Mount auth routes at /auth
    app.use('/auth', authRouter);

    // Mount verify routes at /holder-verify
    app.use('/holder-verify', verifyRouter);

    // Mount store-wallet endpoint at root level
    app.post('/store-wallet', async (req, res) => {
      try {
        if (!req.session.user) {
          return res.status(401).json({ error: 'Not authenticated' });
        }

        const { walletAddress } = req.body;
        if (!walletAddress) {
          return res.status(400).json({ error: 'Wallet address required' });
        }

        console.log('Storing wallet:', {
          userId: req.session.user.id,
          walletAddress,
        });

        // Store wallet in Redis
        await redis.sadd(`wallets:${req.session.user.id}`, walletAddress);
        
        // Return success response
        res.json({ 
          success: true,
          message: 'Wallet stored successfully',
          data: {
            userId: req.session.user.id,
            walletAddress
          }
        });

      } catch (error) {
        console.error('Error storing wallet:', error);
        res.status(500).json({ 
          error: 'Failed to store wallet',
          details: error.message
        });
      }
    });

    // Start server first
    const server = await new Promise((resolve, reject) => {
      const server = app.listen(port, '0.0.0.0', () => {
        console.log(`Server running on port ${port}`);
        resolve(server);
      }).on('error', reject);
    });

    console.log('Server started successfully');

    // Wait for Redis to be ready
    await redis.connect();
    console.log('Redis connected successfully');

    // Load all hashlists with proper paths
    console.log('Loading hashlists...');
    
    // Main collections
    hashlistsData.fckedCatz = await loadHashlist('fcked_catz.json');
    hashlistsData.celebCatz = await loadHashlist('celebcatz.json');
    hashlistsData.moneyMonsters = await loadHashlist('money_monsters.json');
    hashlistsData.moneyMonsters3d = await loadHashlist('money_monsters3d.json');
    hashlistsData.aiBitbots = await loadHashlist('ai_bitbots.json');
    
    // Top holders
    hashlistsData.mmTop10 = await loadHashlist('MM_top10.json');
    hashlistsData.mm3dTop10 = await loadHashlist('MM3D_top10.json');
    
    // AI Collabs with proper paths
    hashlistsData.warriors = await loadHashlist('ai_collabs/warriors.json');
    hashlistsData.squirrels = await loadHashlist('ai_collabs/squirrels.json');
    hashlistsData.rjctdBots = await loadHashlist('ai_collabs/rjctd_bots.json');
    hashlistsData.energyApes = await loadHashlist('ai_collabs/energy_apes.json');
    hashlistsData.doodleBots = await loadHashlist('ai_collabs/doodle_bot.json');
    hashlistsData.candyBots = await loadHashlist('ai_collabs/candy_bots.json');

    // Log loaded hashlist sizes
    console.log('Loaded hashlist sizes:', {
      fckedCatz: hashlistsData.fckedCatz.size,
      celebCatz: hashlistsData.celebCatz.size,
      moneyMonsters: hashlistsData.moneyMonsters.size,
      moneyMonsters3d: hashlistsData.moneyMonsters3d.size,
      aiBitbots: hashlistsData.aiBitbots.size,
      warriors: hashlistsData.warriors.size,
      squirrels: hashlistsData.squirrels.size,
      rjctdBots: hashlistsData.rjctdBots.size,
      energyApes: hashlistsData.energyApes.size,
      doodleBots: hashlistsData.doodleBots.size,
      candyBots: hashlistsData.candyBots.size,
      mmTop10: hashlistsData.mmTop10.size,
      mm3dTop10: hashlistsData.mm3dTop10.size
    });

    // Update hashlists in verify service
    updateHashlists(hashlistsData);

    // Initialize Discord client
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
      ]
    });

    // Add message event handler
    client.on('messageCreate', async (message) => {
      try {
        if (message.author.bot) return;

        if (message.content.startsWith('=')) {
          const command = message.content.slice(1).toLowerCase();

          // Check if command is a my.* command
          if (command.startsWith('my.')) {
            // Check if user has verified wallets
            const walletData = await getWalletData(message.author.id);
            if (!walletData.walletAddresses.length) {
              const verifyUrl = process.env.SIGN_IN_URL || 'https://buxdao-verify-d1faffc83da7.herokuapp.com/holder-verify';
              return await message.channel.send(
                `Please verify your wallet first at ${verifyUrl} before using profile commands.`
              );
            }
          }

          switch (command) {
            case 'my.profile':
              await updateUserProfile(message.channel, message.author.id, client);
              break;

            case 'my.wallet':
              await displayWallets(message.channel, message.author.id);
              break;

            case 'my.nfts':
              await displayNFTs(message.channel, message.author.id, client);
              break;

            case 'my.roles':
              await displayRoles(message.channel, message.author.id, client);
              break;

            case 'my.bux':
              await displayBuxBalance(message.channel, message.author.id, client);
              break;

            case 'help':
              await displayHelp(message.channel);
              break;

            case 'info.catz':
              await displayCatzInfo(message.channel);
              break;

            case 'info.mm':
              await displayMMInfo(message.channel);
              break;

            case 'info.mm3d':
              await displayMM3DInfo(message.channel);
              break;

            case 'info.celeb':
              await displayCelebInfo(message.channel);
              break;

            case 'info.bots':
              await displayBitbotsInfo(message.channel);
              break;

            case 'rewards':
              await displayRewards(message.channel);
              break;

            case 'info.bux':
              await displayBuxInfo(message.channel);
              break;
          }
        }
      } catch (error) {
        console.error('Error handling message:', error);
        await message.channel.send('An error occurred while processing your command. Please try again later.');
      }
    });

    // Login to Discord
    await client.login(config.discord.token);
    console.log('Discord bot logged in');

    // After creating Discord client
    global.discordClient = client;

  } catch (error) {
    console.error('Error starting application:', error);
    process.exit(1);
  }
}

// Start the application
startApp();

// Handle process errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
  process.exit(1);
});

