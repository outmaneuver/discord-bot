import { EmbedBuilder } from 'discord.js';
import { checkNFTOwnership, getBUXBalance, updateDiscordRoles } from './verify.js';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  }
});

export async function getWalletData(userId) {
  console.log('Retrieving wallet data for user:', userId);
  
  try {
    const walletAddresses = await getAllWallets(userId);
    console.log('Retrieved wallet addresses:', walletAddresses);

    if (walletAddresses.length === 0) {
      console.log('No wallets connected for user:', userId);
      return null;
    }

    const aggregatedData = await aggregateWalletData(walletAddresses);

    return {
      walletAddresses,
      nftCounts: aggregatedData.nftCounts,
      buxBalance: aggregatedData.buxBalance,
    };
  } catch (error) {
    console.error('Error fetching wallet data:', error);
    return null;
  }
}

export async function getPokerStats(userId) {
    // ... (existing getPokerStats function)
}

export async function getSpadesStats(userId) {
    // ... (existing getSpadesStats function)
}

export async function sendProfileMessage(channel, userId) {
  try {
    console.log('Sending profile message for user:', userId);
    const walletData = await getWalletData(userId);

    if (!walletData) {
      console.log('No wallet data found for user:', userId);
      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('Profile Not Found')
        .setDescription('No wallet connected. Please verify your wallet first.')
        .addFields(
          { name: 'How to Verify', value: 'Use the `!verify` command to get a link to connect your wallet.' }
        )
        .setTimestamp();

      await channel.send({ embeds: [embed] });
      return;
    }

    const user = await channel.client.users.fetch(userId);
    const username = user.username;

    // Update Discord roles based on aggregated wallet data
    console.log('Updating Discord roles based on all connected wallets');
    await updateDiscordRoles(channel.client, userId, walletData.nftCounts, walletData.buxBalance);

    const member = await channel.guild.members.fetch(userId);
    const roles = member.roles.cache
      .filter(role => role.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(role => role.name)
      .join(', ');

    console.log('Creating profile embed for user:', username);
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`${username}'s BUX DAO Profile`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }))
      .addFields(
        { name: 'Connected Wallets', value: walletData.walletAddresses.join('\n') },
        { name: 'BUX Balance', value: `${walletData.buxBalance} BUX` },
        { name: 'NFTs', value: formatNFTCounts(walletData.nftCounts) },
        { name: 'Server Roles', value: roles || 'No roles' }
      )
      .setTimestamp();

    console.log('Sending profile embed');
    await channel.send({ embeds: [embed] });
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

export function generateProfileHtml(walletData, pokerStats, spadesStats) {
    // ... (generate HTML for profile)
}

async function getAllWallets(userId) {
  const key = `wallets:${userId}`;
  try {
    const wallets = await redis.smembers(key);
    console.log(`Retrieved wallets for user ${userId}:`, wallets);
    return wallets;
  } catch (error) {
    console.error(`Error retrieving wallets for user ${userId}:`, error);
    return [];
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

      console.log(`NFT counts for wallet ${wallet}:`, nftCounts);
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

  console.log('Aggregated NFT counts:', aggregatedNftCounts);
  console.log('Total BUX balance:', totalBuxBalance);

  return {
    nftCounts: aggregatedNftCounts,
    buxBalance: totalBuxBalance
  };
}
