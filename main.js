import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { initializeSalesListings } from './sales_listings.js';
import { verifyHolder, sendVerificationMessage, checkNFTOwnership, getBUXBalance, updateDiscordRoles } from './verify.js';
import { sendProfileMessage } from './profile.js';

import { handleMainCommands } from './main_commands.js';
import { handleVerifyCommands } from './verify_commands.js';
import { handleProfileCommands } from './profile_commands.js';
import { handleSalesListingsCommands } from './sales_listings_commands.js';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ... (rest of your existing setup code)

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Handle commands from each module
  await handleMainCommands(message, client);
  await handleVerifyCommands(message, client);
  await handleProfileCommands(message, client);
  await handleSalesListingsCommands(message, client);
});

// ... (rest of your existing code)

client.login(process.env.DISCORD_TOKEN);
