import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import winston from 'winston';
import { fileURLToPath } from 'url';
import path from 'path';
import session from 'express-session';
import authRouter from './routes/auth.js';
import RedisStore from 'connect-redis';
import { redis } from './config/redis.js';
import { config } from './config/config.js';
import { promises as fs } from 'fs';
import cookieParser from 'cookie-parser';
import verifyRouter from './routes/verify.js';
import { handleCommand } from './commands/index.js';

import { 
  verifyWallet,
  updateDiscordRoles,
  updateHashlists,
  hashlists,
  storeWalletAddress
} from './services/verify.js';

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

const HASHLIST_CACHE_KEY = 'hashlists:loaded';
const HASHLIST_CACHE_TTL = 3600;

async function loadHashlist(filename) {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const filePath = path.join(__dirname, 'config', 'hashlists', filename);
    const cacheKey = `hashlist:${filename}`;
    
    const cached = await redis.get(cacheKey);
    if (cached) {
      return new Set(JSON.parse(cached));
    }
    
    const data = await fs.readFile(filePath, 'utf8');
    const addresses = JSON.parse(data);
    
    await redis.setex(cacheKey, HASHLIST_CACHE_TTL, JSON.stringify(addresses));
    return new Set(addresses);
  } catch (error) {
    console.error(`Error loading ${filename}:`, error.message);
    return new Set();
  }
}

// Initialize logger first
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),  // Add console transport
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

async function startApp() {
  try {
    const port = process.env.PORT || 3000;
    const app = express();
    
    app.use(cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
    }));
    app.use(express.json());
    
    const redisStore = new RedisStore({
      client: redis,
      prefix: 'session:'
    });

    app.use(cookieParser());
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

    if (process.env.NODE_ENV !== 'production') {
      app.use((req, res, next) => {
        console.log('Session Debug:', {
          id: req.sessionID,
          user: req.session?.user
        });
        next();
      });
    }

    app.set('trust proxy', 1);

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    app.use(express.static(path.join(__dirname, 'public')));
    app.use('/holder-verify', express.static(path.join(__dirname, 'public')));
    app.use('/auth', authRouter);
    app.use('/holder-verify', verifyRouter);

    app.post('/store-wallet', async (req, res) => {
      try {
        const { walletAddress, walletType } = req.body;
        const userId = req.session?.user?.id;

        if (!userId || !walletAddress) {
          return res.status(400).json({
            success: false,
            error: !userId ? 'Not authenticated' : 'Wallet address required'
          });
        }

        const result = await storeWalletAddress(userId, walletAddress, walletType);
        res.json(result);
      } catch (error) {
        console.error('Store wallet error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Failed to store wallet'
        });
      }
    });

    const server = app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });

    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down...');
      server.close(() => {
        redis.quit();
        process.exit(0);
      });
    });

    console.log('Loading hashlists...');
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
      hashlistsData[key] = await loadHashlist(filename);
    }

    console.log('Hashlists loaded successfully');
    updateHashlists(hashlistsData);

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
      ]
    });

    client.on('ready', () => {
      logger.info(`Logged in as ${client.user.tag}`);
    });

    client.on('error', (error) => {
      logger.error('Discord client error:', error);
    });

    client.on('messageCreate', async message => {
      if (message.author.bot) return;
      if (message.content.startsWith('=')) {
        await handleCommand(message);
      }
    });

    await client.login(config.discord.token);
    global.discordClient = client;

  } catch (error) {
    logger.error('Startup error:', error);
    process.exit(1);
  }
}

startApp().catch(error => {
  console.error('Fatal startup error:', error.message);
  process.exit(1);
});

// Global error handlers
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

