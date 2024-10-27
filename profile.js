import { EmbedBuilder } from 'discord.js';
import { updateDiscordRoles, checkNFTOwnership, getBUXBalance } from './verify.js';
import { startOrUpdateDailyTimer, getTimeUntilNextClaim } from './rewards.js';
import Redis from 'ioredis';
import fs from 'fs/promises';
import path from 'path';

const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  }
});

// Load hashlists
const loadHashlist = async (filename) => {
  const filePath = path.join(process.cwd(), 'hashlists', filename);
  const data = await fs.readFile(filePath, 'utf8');
  return new Set(JSON.parse(data));
};

let fckedCatzHashlist, celebcatzHashlist, moneyMonstersHashlist, moneyMonsters3dHashlist, aiBitbotsHashlist;

const initializeHashlists = async () => {
  fckedCatzHashlist = await loadHashlist('fcked_catz.json');
  celebcatzHashlist = await loadHashlist('celebcatz.json');
  moneyMonstersHashlist = await loadHashlist('money_monsters.json');
  moneyMonsters3dHashlist = await loadHashlist('money_monsters3d.json');
  aiBitbotsHashlist = await loadHashlist('ai_bitbots.json');
};

// Call this function when your bot starts up
initializeHashlists();

export async function addWallet(userId, walletAddress) {
  const key = `wallets:${userId}`;
  try {
    // Remove angle brackets if present
    const cleanWalletAddress = walletAddress.replace(/[<>]/g, '');
    const result = await redis.sadd(key, cleanWalletAddress);
    console.log(`Added wallet ${cleanWalletAddress} for user ${userId}. Result: ${result}`);
    return result === 1; // Returns true if the wallet was successfully added
  } catch (error) {
    console.error(`Error adding wallet ${walletAddress} for user ${userId}:`, error);
    throw error;
  }
}

export async function removeWallet(userId, walletAddress) {
  const key = `wallets:${userId}`;
  try {
    const result = await redis.srem(key, walletAddress);
    console.log(`Removed wallet ${walletAddress} for user ${userId}. Result: ${result}`);
    return result === 1; // Returns true if the wallet was successfully removed
  } catch (error) {
    console.error(`Error removing wallet ${walletAddress} for user ${userId}:`, error);
    throw error;
  }
}

export async function getWalletData(userId) {
  console.log(`Retrieving wallet data for user: ${userId}`);
  const key = `wallets:${userId}`;
  try {
    const walletAddresses = await redis.smembers(key);
    console.log(`Retrieved wallets for user ${userId}:`, walletAddresses);
    return { walletAddresses };
  } catch (error) {
    console.error(`Error retrieving wallet data for user ${userId}:`, error);
    throw error;
  }
}

async function aggregateWalletData(wallets) {
  let aggregatedNftCounts = {
    fcked_catz: [],
    celebcatz: [],
    money_monsters: [],
    money_monsters3d: [],
    ai_bitbots: []
  };
  let totalBuxBalance = 0;

  for (const wallet of wallets) {
    console.log(`Aggregating data for wallet: ${wallet}`);
    try {
      const nftCounts = await checkNFTOwnership(wallet);
      const buxBalance = await getBUXBalance(wallet);

      console.log(`NFT counts for wallet ${wallet}:`, JSON.stringify(nftCounts, null, 2));
      console.log(`BUX balance for wallet ${wallet}:`, buxBalance);

      // Aggregate NFT counts
      for (const [collection, nfts] of Object.entries(nftCounts)) {
        aggregatedNftCounts[collection] = [...aggregatedNftCounts[collection], ...nfts];
      }

      // Aggregate BUX balance
      totalBuxBalance += buxBalance;
    } catch (error) {
      console.error(`Error aggregating data for wallet ${wallet}:`, error);
    }
  }

  console.log('Aggregated NFT counts:', JSON.stringify(aggregatedNftCounts, null, 2));
  console.log('Total BUX balance:', totalBuxBalance);

  return {
    nftCounts: aggregatedNftCounts,
    buxBalance: totalBuxBalance
  };
}

export async function updateUserProfile(channel, userId, client) {
  try {
    const walletData = await getWalletData(userId);
    const aggregatedData = await aggregateWalletData(walletData);
    await updateDiscordRoles(userId, aggregatedData, client);

    const user = await client.users.fetch(userId);
    const username = user.username;

    const timerData = await startOrUpdateDailyTimer(userId);
    const timeUntilNext = await getTimeUntilNextClaim(userId);
    
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`${username}'s Updated BUX DAO Profile`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }))
      .addFields(
        { name: 'Connected Wallets', value: walletData.walletAddresses.join('\n') },
        { name: '\u200B', value: '─'.repeat(40) },
        { name: 'NFTs', value: formatNFTCounts(aggregatedData.nftCounts) },
        { name: '\u200B', value: '─'.repeat(40) },
        { name: 'Updated Server Roles', value: roles || 'No roles' },
        { name: '\u200B', value: '─'.repeat(40) },
        { name: 'BUX Balance', value: `${aggregatedData.buxBalance} BUX` },
        { name: 'BUX Claim', value: `${timerData.claimAmount} BUX` },
        { name: 'Next Claim', value: timeUntilNext ? `Updates in ${timeUntilNext}` : 'Start timer by verifying wallet' }
      );

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
}

export async function sendProfileMessage(channel, userId) {
  try {
    await updateUserProfile(channel, userId, channel.client);
  } catch (error) {
    console.error('Error sending profile message:', error);
    await channel.send('An error occurred while fetching your profile. Please try again later.');
  }
}

function formatNFTCounts(nftCounts) {
  return Object.entries(nftCounts)
    .map(([collection, count]) => `${collection}: ${count.length}`)
    .join('\n');
}
