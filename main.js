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

// Setup application
console.log('Application setup complete');

// Start Express server first
const port = process.env.PORT || 3000;
console.log('Server is starting on port', port);

// Setup routes before starting server
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/holder-verify', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/holder-verify/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
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
            '`=verify` - Get wallet verification link'
          ].join('\n')
        }
      );
    await message.channel.send({ embeds: [embed] });
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

