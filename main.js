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

// Initialize client with proper intents
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

// Initialize Express app and start server
const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Login client
client.login(config.discord.token);

// Log when ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

