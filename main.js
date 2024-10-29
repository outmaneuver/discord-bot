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

import { verifyHolder, sendVerificationMessage, updateDiscordRoles } from './services/verify.js';
import { updateUserProfile, getWalletData } from './services/profile.js';
import { config } from './config/config.js';
import {
  startOrUpdateDailyTimer,
  getTimeUntilNextClaim
} from './services/rewards.js';

// Initialize application
console.log('Starting application...');

// Initialize Discord client first
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

// Add session debugging middleware
app.use((req, res, next) => {
  console.log('Session Debug:', {
    id: req.sessionID,
    hasSession: !!req.session,
    sessionData: req.session,
    cookies: req.cookies,
    timestamp: new Date().toISOString()
  });
  next();
});

// Configure session with Redis store
const redisStore = new RedisStore({
  client: redis,
  prefix: 'session:',
  ttl: 86400 // 24 hours
});

// Update session middleware configuration
app.use(session({
  store: redisStore,
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: true, // Changed to true to ensure session is saved
  saveUninitialized: true, // Changed to true to create session for all requests
  name: 'buxdao.sid',
  rolling: true, // Reset expiration on each request
  cookie: {
    secure: false, // Set to false to test
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax',
    path: '/'
  }
}));

// Add Redis store error handling
redisStore.on('error', function(error) {
  console.error('Redis store error:', error);
});

// Add auth routes
app.use('/auth', authRouter);

// Setup application
console.log('Application setup complete');

// Setup routes before starting server
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Serve static files from public directory
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

// Start Express server first
const port = process.env.PORT || 3000;
console.log('Server is starting on port', port);

const server = app.listen(port, () => {
  console.log('Server is running on port', port);
});

server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});

// Load hashlists
const hashlists = {
  fckedCatz: 1422,
  celebCatz: 130,
  moneyMonsters: 666,
  moneyMonsters3d: 666,
  aiBitbots: 218
};
console.log('Hashlists loaded:', hashlists);

// Start Discord client
client.login(config.discord.token).then(() => {
  console.log('Discord bot logged in');
}).catch(error => {
  console.error('Discord login error:', error);
  process.exit(1);
});

// Command handlers
const commandHandlers = {
  'my.profile': async (message) => {
    await updateUserProfile(message.channel, message.author.id, client);
  },
  'my.wallet': async (message) => {
    const walletData = await getWalletData(message.author.id);
    const embed = new EmbedBuilder()
      .setTitle(`${message.author.username}'s Connected Wallets`)
      .setDescription(walletData.walletAddresses.join('\n') || 'No wallets connected');
    await message.channel.send({ embeds: [embed] });
  },
  'my.nfts': async (message) => {
    try {
      const walletData = await getWalletData(message.author.id);
      if (!walletData || !walletData.walletAddresses || walletData.walletAddresses.length === 0) {
        return message.reply('No wallets connected. Please verify your wallet first.');
      }
      
      const aggregatedData = await aggregateWalletData(walletData);
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${message.author.username}'s NFT Collection`)
        .addFields({
          name: 'NFTs',
          value: Object.entries(aggregatedData.nftCounts)
            .map(([collection, nfts]) => `${collection}: ${nfts.length}`)
            .join('\n') || 'No NFTs found'
        });
      
      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error in my.nfts command:', error);
      await message.reply('Error fetching NFTs. Please try again later.');
    }
  },
  'verify': async (message) => {
    await message.reply({
      content: 'Please visit https://buxdao-verify-d1faffc83da7.herokuapp.com/holder-verify/ to verify your wallet',
      ephemeral: true
    });
  },
  'help': async (message) => {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('BUX DAO Bot Commands')
      .addFields(
        { 
          name: 'Profile Commands',
          value: [
            '`=my.profile` - View your full profile',
            '`=my.wallet` - View your connected wallets',
            '`=my.nfts` - View your NFT holdings',
            '`=verify` - Get wallet verification link',
            '`=gm` - Get a friendly greeting'
          ].join('\n')
        }
      );
    await message.channel.send({ embeds: [embed] });
  },
  'gm': async (message) => {
    const greetings = [
      "GM! Have an awesome day! 🌞",
      "Good morning, champion! Ready to conquer the day? 💪",
      "GM GM! Let's make today amazing! ✨",
      "Rise and shine! GM fren! 🌅",
      "GM! Hope your day is as nice as your NFTs! 🎨"
    ];
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    await message.reply(randomGreeting);
  }
};

// Message handler
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const command = message.content.toLowerCase().trim();

  // Handle profile command aliases
  if (command === '=my.profile' || command === '=profile') {
    try {
      await updateUserProfile(message.channel, message.author.id, client);
    } catch (error) {
      console.error('Error handling profile command:', error);
      await message.channel.send('An error occurred while processing your command.');
    }
    return;
  }

  // Handle other commands
  const commandName = command.substring(1); // Remove the = prefix
  const handler = commandHandlers[commandName];
  if (handler) {
    try {
      await handler(message);
    } catch (error) {
      console.error('Error handling message:', error);
      await message.channel.send('An error occurred while processing your command.');
    }
  }
});

// Log when ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

