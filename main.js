import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import { initializeSalesListings } from './sales_listings.js';
import { verifyHolder, sendVerificationMessage, checkNFTOwnership, getBUXBalance, updateDiscordRoles } from './verify.js';
import { sendProfileMessage } from './profile.js';

import { handleMainCommands } from './main_commands.js';
import { handleVerifyCommands } from './verify_commands.js';
import { handleProfileCommands } from './profile_commands.js';
import { handleSalesListingsCommands } from './sales_listings_commands.js';

console.log('Starting application...');

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

console.log('Discord client created');

const app = express();
console.log('Express app created');

// Express middleware and session setup
app.use(cors({
  origin: ['https://yourdomain.com', 'https://anotherdomain.com']
}));
app.use(express.json());
app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
}));
app.use(passport.initialize());
app.use(passport.session());

console.log('Express middleware set up');

// ... (rest of your existing setup code)

// Serve static files
app.use('/holder-verify', express.static(path.join(__dirname, 'public')));

// Serve index.html for /holder-verify route
app.get('/holder-verify', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all route for 404 errors
app.use((req, res) => {
  res.status(404).send('404 - Not Found');
});

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server is starting on port ${PORT}`);
})
.on('error', (err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});

// Set a timeout to exit if the server hasn't started within 55 seconds
const startTimeout = setTimeout(() => {
  console.error('Server failed to start within 55 seconds');
  process.exit(1);
}, 55000);

server.on('listening', () => {
  clearTimeout(startTimeout);
  console.log(`Server is running on port ${PORT}`);
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  initializeSalesListings(client);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  await handleMainCommands(message, client);
  await handleVerifyCommands(message, client);
  await handleProfileCommands(message, client);
  await handleSalesListingsCommands(message, client);
});

client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('Discord bot logged in'))
  .catch(err => {
    console.error('Error logging in to Discord:', err);
    process.exit(1);
  });

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('Application setup complete');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://api.mainnet-beta.solana.com"],
    },
  },
}));
