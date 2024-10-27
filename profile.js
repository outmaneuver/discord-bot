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

// Export getWalletData function
export async function getWalletData(userId) {
  try {
    const data = await redis.get(`wallets:${userId}`);
    if (!data) {
      return { walletAddresses: [] };
    }
    return JSON.parse(data);
  } catch (error) {
    console.error('Error getting wallet data:', error);
    return { walletAddresses: [] };
  }
}

// Add wallet management functions
export async function addWallet(userId, walletAddress) {
  try {
    const data = await getWalletData(userId);
    if (!data.walletAddresses.includes(walletAddress)) {
      data.walletAddresses.push(walletAddress);
      await redis.set(`wallets:${userId}`, JSON.stringify(data));
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error adding wallet:', error);
    return false;
  }
}

export async function removeWallet(userId, walletAddress) {
  try {
    const data = await getWalletData(userId);
    const index = data.walletAddresses.indexOf(walletAddress);
    if (index > -1) {
      data.walletAddresses.splice(index, 1);
      await redis.set(`wallets:${userId}`, JSON.stringify(data));
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error removing wallet:', error);
    return false;
  }
}

async function aggregateWalletData(walletData) {
  const aggregatedData = {
    nftCounts: {
      fcked_catz: [],
      celebcatz: [],
      money_monsters: [],
      money_monsters3d: [],
      ai_bitbots: []
    },
    buxBalance: 0
  };

  for (const walletAddress of walletData.walletAddresses) {
    try {
      console.log('Aggregating data for wallet:', walletAddress);
      
      // Get NFT data
      const nftCounts = await checkNFTOwnership(walletAddress);
      console.log('NFT counts for wallet', walletAddress + ':', nftCounts);
      
      // Merge NFT arrays
      Object.keys(nftCounts).forEach(collection => {
        aggregatedData.nftCounts[collection] = [
          ...aggregatedData.nftCounts[collection],
          ...nftCounts[collection]
        ];
      });

      // Get BUX balance
      const balance = await getBUXBalance(walletAddress);
      console.log('BUX balance for wallet', walletAddress + ':', balance);
      aggregatedData.buxBalance += balance;

    } catch (error) {
      console.error('Error aggregating data for wallet', walletAddress + ':', error);
    }
  }

  console.log('Aggregated NFT counts:', aggregatedData.nftCounts);
  console.log('Total BUX balance:', aggregatedData.buxBalance);
  return aggregatedData;
}

export async function updateUserProfile(channel, userId, client) {
  try {
    const walletData = await getWalletData(userId);
    const aggregatedData = await aggregateWalletData(walletData);
    await updateDiscordRoles(userId, aggregatedData, client);

    const user = await client.users.fetch(userId);
    const username = user.username;

    const timerData = await startOrUpdateDailyTimer(userId, aggregatedData.nftCounts, aggregatedData.buxBalance);
    const timeUntilNext = await getTimeUntilNextClaim(userId);
    
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`${username}'s Updated BUX DAO Profile`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }))
      .addFields(
        { name: 'Connected Wallets', value: walletData.walletAddresses.join('\n') || 'No wallets connected' },
        { name: '\u200B', value: '─'.repeat(40) },
        { name: 'NFTs', value: formatNFTCounts(aggregatedData.nftCounts) || 'No NFTs' },
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
    .map(([collection, nfts]) => `${collection}: ${nfts.length}`)
    .join('\n');
}
