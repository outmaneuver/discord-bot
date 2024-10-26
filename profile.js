import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { checkNFTOwnership, getBUXBalance } from './verify.js';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export async function getWalletData(userId) {
  console.log('Retrieving wallet data for user:', userId);
  
  try {
    const walletAddress = await redis.get(`wallet:${userId}`);
    console.log('Retrieved wallet address:', walletAddress);

    if (!walletAddress) {
      console.log('No wallet connected for user:', userId);
      return null; // No wallet connected
    }

    // Fetch NFT and BUX data for this wallet address
    const nftCounts = await checkNFTOwnership(walletAddress);
    const buxBalance = await getBUXBalance(walletAddress);

    console.log('Fetched data:', { nftCounts, buxBalance });

    return {
      walletAddress,
      nftCounts,
      buxBalance,
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

    console.log('Creating profile embed for user:', username);
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`${username}'s BUX DAO Profile`)
      .addFields(
        { name: 'Wallet Address', value: walletData.walletAddress },
        { name: 'BUX Balance', value: `${walletData.buxBalance} BUX` },
        { name: 'NFTs', value: formatNFTCounts(walletData.nftCounts) },
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



