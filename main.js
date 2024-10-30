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

import { verifyHolder, updateDiscordRoles } from './services/verify.js';
import { updateUserProfile, getWalletData } from './services/profile.js';
import { config } from './config/config.js';
import {
  startOrUpdateDailyTimer,
  getTimeUntilNextClaim
} from './services/rewards.js';

// Initialize hashlists with hardcoded data
let hashlists = {
  fckedCatz: new Set(),
  celebCatz: new Set(),
  moneyMonsters: new Set(),
  moneyMonsters3d: new Set(),
  aiBitbots: new Set(),
  warriors: new Set()
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

// Initialize Redis first
redis.on('error', (err) => {
  console.error('Redis error:', err);
  process.exit(1);
});

redis.on('ready', async () => {
  console.log('Redis connected and ready');
  
  // Load all hashlists before starting app
  try {
    hashlists.fckedCatz = await loadHashlist('fcked_catz.json');
    hashlists.celebCatz = await loadHashlist('celebcatz.json');
    hashlists.moneyMonsters = await loadHashlist('money_monsters.json');
    hashlists.moneyMonsters3d = await loadHashlist('money_monsters3d.json');
    hashlists.aiBitbots = await loadHashlist('ai_bitbots.json');
    hashlists.warriors = await loadHashlist('ai_collabs/warriors.json');
    
    console.log('Loaded hashlists:', {
      fckedCatz: hashlists.fckedCatz.size,
      celebCatz: hashlists.celebCatz.size,
      moneyMonsters: hashlists.moneyMonsters.size,
      moneyMonsters3d: hashlists.moneyMonsters3d.size,
      aiBitbots: hashlists.aiBitbots.size,
      warriors: hashlists.warriors.size
    });
    
    startApp();
  } catch (error) {
    console.error('Error loading hashlists:', error);
    process.exit(1);
  }
});

// Main application startup function
async function startApp() {
  try {
    // Initialize Discord client
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
    console.log('Discord client created');

    // Initialize Express app
    const app = express();
    app.use(cors());
    app.use(express.json());
    console.log('Express app created');

    // Configure session with Redis store
    const redisStore = new RedisStore({
      client: redis,
      prefix: 'session:'
    });

    // Update session middleware configuration
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

    // Add auth routes
    app.use('/auth', authRouter);

    // Serve static files
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    app.use(express.static(path.join(__dirname, 'public')));
    app.use('/holder-verify', express.static(path.join(__dirname, 'public')));

    // Add verify endpoint
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

    // Add helper function to calculate daily reward
    function calculateDailyReward(nftCounts) {
      let reward = 0;
      reward += nftCounts.fcked_catz.length * 2;      // 2 BUX per FCatz
      reward += nftCounts.celebcatz.length * 8;       // 8 BUX per CelebCatz
      reward += nftCounts.money_monsters.length * 2;   // 2 BUX per MM
      reward += nftCounts.money_monsters3d.length * 4; // 4 BUX per MM3D
      reward += nftCounts.ai_bitbots.length * 1;      // 1 BUX per AI Bitbot
      reward += nftCounts.warriors.length * 2;      // 2 BUX per Warriors NFT
      return reward;
    }

    // Route handler for verification page
    app.get(['/holder-verify', '/holder-verify/'], (req, res) => {
      try {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
      } catch (error) {
        console.error('Error serving verification page:', error);
        res.status(500).send('Error loading verification page');
      }
    });

    // Add store-wallet endpoint
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

    // Error handler for 404s
    app.use((req, res) => {
      res.status(404).send('Page not found');
    });

    // Start server
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });

    // Start Discord client
    await client.login(config.discord.token);
    console.log('Discord bot logged in');

  } catch (error) {
    console.error('Error starting application:', error);
    process.exit(1);
  }
}

// Handle process errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
  process.exit(1);
});

