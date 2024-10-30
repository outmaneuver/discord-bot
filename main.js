import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import { 
  EmbedBuilder, 
  ButtonBuilder, 
  ActionRowBuilder, 
  ButtonStyle 
} from 'discord.js';
import session from 'express-session';
import authRouter from './routes/auth.js';
import RedisStore from 'connect-redis';
import { redis } from './config/redis.js';
import fs from 'fs/promises';

import { verifyHolder, updateDiscordRoles, updateHashlists } from './services/verify.js';
import { updateUserProfile, getWalletData } from './services/profile.js';
import { config } from './config/config.js';
import {
  startOrUpdateDailyTimer,
  getTimeUntilNextClaim
} from './services/rewards.js';

// Initialize hashlists with all collections
let hashlists = {
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

// Initialize application
console.log('Starting application...');

// Function to load hashlist from JSON file
async function loadHashlist(filename) {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const filePath = path.join(__dirname, 'config', 'hashlists', filename);
    const data = await fs.readFile(filePath, 'utf8');
    return new Set(JSON.parse(data));
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
    app.use(cors());
    app.use(express.json());
    console.log('Express app created');

    // Start server first
    const server = await new Promise((resolve, reject) => {
      const server = app.listen(port, '0.0.0.0', () => {
        console.log(`Server running on port ${port}`);
        resolve(server);
      }).on('error', reject);
    });

    console.log('Server started successfully');

    // Wait for Redis to be ready with retries
    let retries = 5;
    while (retries > 0) {
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Redis connection attempt timeout'));
          }, 5000);

          // Check if Redis is already connected
          if (redis.status === 'ready') {
            clearTimeout(timeout);
            resolve();
            return;
          }

          // Try to connect using URL directly
          redis.connect(process.env.REDIS_URL).then(() => {
            clearTimeout(timeout);
            resolve();
          }).catch(err => {
            clearTimeout(timeout);
            reject(err);
          });
        });
        console.log('Redis connected successfully');
        break;
      } catch (error) {
        retries--;
        console.log(`Redis connection attempt failed, ${retries} retries left:`, error.message);
        if (retries === 0) throw new Error('Redis connection failed after all retries');
        // Wait 2 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Load all hashlists after Redis is ready
    hashlists.fckedCatz = await loadHashlist('fcked_catz.json');
    hashlists.celebCatz = await loadHashlist('celebcatz.json');
    hashlists.moneyMonsters = await loadHashlist('money_monsters.json');
    hashlists.moneyMonsters3d = await loadHashlist('money_monsters3d.json');
    hashlists.aiBitbots = await loadHashlist('ai_bitbots.json');
    hashlists.mmTop10 = await loadHashlist('MM_top10.json');
    hashlists.mm3dTop10 = await loadHashlist('MM3D_top10.json');
    
    // Load AI Collabs hashlists
    hashlists.warriors = await loadHashlist('ai_collabs/warriors.json');
    hashlists.squirrels = await loadHashlist('ai_collabs/squirrels.json');
    hashlists.rjctdBots = await loadHashlist('ai_collabs/rjctd_bots.json');
    hashlists.energyApes = await loadHashlist('ai_collabs/energy_apes.json');
    hashlists.doodleBots = await loadHashlist('ai_collabs/doodle_bot.json');
    hashlists.candyBots = await loadHashlist('ai_collabs/candy_bots.json');
    
    console.log('Loaded hashlists:', {
      // Main collections
      fckedCatz: hashlists.fckedCatz.size,
      celebCatz: hashlists.celebCatz.size,
      moneyMonsters: hashlists.moneyMonsters.size,
      moneyMonsters3d: hashlists.moneyMonsters3d.size,
      aiBitbots: hashlists.aiBitbots.size,
      
      // Top holders
      mmTop10: hashlists.mmTop10.size,
      mm3dTop10: hashlists.mm3dTop10.size,
      
      // AI Collabs
      warriors: hashlists.warriors.size,
      squirrels: hashlists.squirrels.size,
      rjctdBots: hashlists.rjctdBots.size,
      energyApes: hashlists.energyApes.size,
      doodleBots: hashlists.doodleBots.size,
      candyBots: hashlists.candyBots.size
    });

    // Update hashlists in verify service
    updateHashlists(hashlists);

    // Configure Redis store
    const redisStore = new RedisStore({
      client: redis,
      prefix: 'session:'
    });

    // Add session middleware
    app.use(session({
      store: redisStore,
      secret: process.env.SESSION_SECRET || 'your-secret-key',
      resave: true,
      saveUninitialized: true,
      name: 'buxdao.sid',
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
      }
    }));

    // Add routes and middleware
    app.use('/auth', authRouter);
    
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    app.use(express.static(path.join(__dirname, 'public')));
    app.use('/holder-verify', express.static(path.join(__dirname, 'public')));

    // Add API endpoints
    app.post('/holder-verify/verify', async (req, res) => {
      try {
        const { walletAddress } = req.body;
        if (!req.session?.user?.id) {
          return res.status(401).json({
            success: false,
            error: 'Not authenticated'
          });
        }

        const result = await verifyHolder(
          { walletAddress }, 
          req.session.user.id,
          client
        );

        // Calculate daily reward based on NFT holdings
        const dailyReward = calculateDailyReward(result.nftCounts);

        // Clean, simple formatting with daily reward
        const formattedResponse = `**Wallet Verification Complete!** ✅

NFTs Found:
${Object.entries(result.nftCounts)
  .map(([collection, nfts]) => `${collection}: ${nfts.length}`)
  .join('\n')}

**Daily reward - ${dailyReward} $BUX**

Your roles have been updated! 🎉`;

        res.json({
          success: true,
          nftCounts: result.nftCounts,
          message: result.message,
          formattedResponse: formattedResponse
        });

      } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    app.get(['/holder-verify', '/holder-verify/'], (req, res) => {
      try {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
      } catch (error) {
        console.error('Error serving verification page:', error);
        res.status(500).send('Error loading verification page');
      }
    });

    app.post('/store-wallet', async (req, res) => {
      try {
        const { walletAddress } = req.body;
        if (!req.session?.user?.id) {
          return res.status(401).json({
            success: false,
            error: 'Not authenticated'
          });
        }

        // Store wallet address in Redis
        await redis.sadd(`wallets:${req.session.user.id}`, walletAddress);

        console.log('Stored wallet address:', {
          userId: req.session.user.id,
          walletAddress,
          timestamp: new Date().toISOString()
        });

        res.json({
          success: true,
          message: 'Wallet address stored successfully'
        });

      } catch (error) {
        console.error('Error storing wallet address:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Error handler
    app.use((req, res) => {
      res.status(404).send('Page not found');
    });

    // Initialize Discord client after server is running
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions
      ]
    });

    // Login to Discord
    await client.login(config.discord.token);
    console.log('Discord bot logged in');

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

// Add helper function to calculate daily reward
function calculateDailyReward(nftCounts) {
  try {
    let reward = 0;
    
    // Make sure we're working with numbers
    const counts = {
      fcked_catz: nftCounts.fcked_catz?.length || 0,
      celebcatz: nftCounts.celebcatz?.length || 0,
      money_monsters: nftCounts.money_monsters?.length || 0,
      money_monsters3d: nftCounts.money_monsters3d?.length || 0,
      ai_bitbots: nftCounts.ai_bitbots?.length || 0,
      warriors: nftCounts.warriors?.length || 0
    };
    
    // Calculate rewards
    reward += counts.fcked_catz * 2;      // 2 BUX per FCatz
    reward += counts.celebcatz * 8;       // 8 BUX per CelebCatz
    reward += counts.money_monsters * 2;   // 2 BUX per MM
    reward += counts.money_monsters3d * 4; // 4 BUX per MM3D
    reward += counts.ai_bitbots * 1;      // 1 BUX per AI Bitbot
    reward += counts.warriors * 2;         // 2 BUX per Warriors NFT

    console.log('Daily reward calculation:', {
      counts,
      reward,
      timestamp: new Date().toISOString()
    });

    return reward;
  } catch (error) {
    console.error('Error calculating daily reward:', error);
    return 0;
  }
}

