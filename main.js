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
  verifyWallet,
  updateDiscordRoles,
  updateHashlists,
  getBUXBalance,
  hashlists,
  storeWalletAddress
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
  displayBuxBalance
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

// Add caching for hashlist loading
const HASHLIST_CACHE_KEY = 'hashlists:loaded';
const HASHLIST_CACHE_TTL = 3600; // 1 hour

// Function to load hashlist from JSON file with caching
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
    
    // Check cache first
    const cacheKey = `hashlist:${filename}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`Using cached hashlist for ${filename}`);
      return new Set(JSON.parse(cached));
    }
    
    console.log('Loading hashlist:', filePath);
    const data = await fs.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(data);
    
    // Handle different JSON structures
    const addresses = Array.isArray(jsonData) ? jsonData : 
                     jsonData.mints || jsonData.addresses || 
                     Object.keys(jsonData);
                     
    console.log(`Loaded ${addresses.length} addresses from ${filename}`);

    // Cache the addresses
    await redis.setex(cacheKey, HASHLIST_CACHE_TTL, JSON.stringify(addresses));
    
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

    // Add session debug middleware in development
    if (process.env.NODE_ENV !== 'production') {
      app.use((req, res, next) => {
        console.log('Session Debug:', {
          id: req.sessionID,
          user: req.session?.user,
          cookies: req.cookies
        });
        next();
      });
    }

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

    // Add the store-wallet route handler
    app.post('/store-wallet', async (req, res) => {
      try {
        const { walletAddress, walletType } = req.body;
        const userId = req.session?.user?.id;

        if (!userId) {
          console.error('No user ID found in session');
          return res.status(401).json({
            success: false,
            error: 'User not authenticated'
          });
        }

        if (!walletAddress) {
          console.error('No wallet address provided');
          return res.status(400).json({
            success: false,
            error: 'Wallet address is required'
          });
        }

        const result = await storeWalletAddress(userId, walletAddress, walletType);
        res.json(result);
      } catch (error) {
        console.error('Error in store-wallet endpoint:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Start server
    const server = app.listen(port, () => {
      console.log(`Server running on port ${port}`);
      console.log('Server started successfully');
    });

    // Add graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        redis.quit();
        process.exit(0);
      });
    });

    // Load hashlists
    console.log('Loading hashlists...');
    
    // Check if hashlists are already cached
    const hashlistsCached = await redis.get(HASHLIST_CACHE_KEY);
    if (hashlistsCached) {
      console.log('Using cached hashlists');
      hashlistsData = JSON.parse(hashlistsCached);
    } else {
      // Load each hashlist
      const hashlistFiles = {
        fckedCatz: 'fcked_catz.json',
        celebCatz: 'celebcatz.json',
        moneyMonsters: 'money_monsters.json',
        moneyMonsters3d: 'money_monsters3d.json',
        aiBitbots: 'ai_bitbots.json',
        mmTop10: 'MM_top10.json',
        mm3dTop10: 'MM3D_top10.json',
        warriors: 'ai_collabs/warriors.json',
        squirrels: 'ai_collabs/squirrels.json',
        rjctdBots: 'ai_collabs/rjctd_bots.json',
        energyApes: 'ai_collabs/energy_apes.json',
        doodleBots: 'ai_collabs/doodle_bot.json',
        candyBots: 'ai_collabs/candy_bots.json'
      };

      for (const [key, filename] of Object.entries(hashlistFiles)) {
        console.log('Loading hashlist:', filename);
        hashlistsData[key] = await loadHashlist(filename);
        console.log(`Loaded ${hashlistsData[key].size} addresses from ${filename}`);
      }

      // Cache the loaded hashlists
      await redis.setex(
        HASHLIST_CACHE_KEY,
        HASHLIST_CACHE_TTL,
        JSON.stringify(hashlistsData)
      );
    }

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
    console.log('Updating hashlists with:', hashlistsData);
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

    // Add Discord client error handling
    client.on('error', error => {
      console.error('Discord client error:', error);
    });

    client.on('ready', () => {
      console.log('Discord bot logged in');
    });

    // Login to Discord
    await client.login(config.discord.token);

    // After creating Discord client
    global.discordClient = client;

  } catch (error) {
    console.error('Error starting application:', error);
    process.exit(1);
  }
}

// Start the application
startApp().catch(error => {
  console.error('Fatal error starting application:', error);
  process.exit(1);
});

// Handle process errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
  process.exit(1);
});

// Add structured logging
const logger = {
  info: (message, meta = {}) => {
    console.log(JSON.stringify({
      level: 'info',
      message,
      timestamp: new Date().toISOString(),
      ...meta
    }));
  },
  error: (message, error, meta = {}) => {
    console.error(JSON.stringify({
      level: 'error',
      message,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      ...meta
    }));
  }
};

