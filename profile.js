import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export async function getWalletData(userId) {
  // Retrieve wallet addresses for the user
  const walletAddresses = global.userWallets ? global.userWallets.get(userId) : new Set();

  if (!walletAddresses || walletAddresses.size === 0) {
    return null; // No wallets connected
  }

  // Fetch data for the first wallet address (you might want to handle multiple wallets differently)
  const walletAddress = Array.from(walletAddresses)[0];

  // Fetch NFT and BUX data for this wallet address
  const nftCounts = await checkNFTOwnership(walletAddress);
  const buxBalance = await getBUXBalance(walletAddress);

  return {
    walletAddress,
    nftCounts,
    buxBalance,
    // Add other relevant data
  };
}

export async function getPokerStats(userId) {
    // ... (existing getPokerStats function)
}

export async function getSpadesStats(userId) {
    // ... (existing getSpadesStats function)
}

export function sendProfileMessage(channel) {
    // ... (existing sendProfileMessage function)
}

export function generateProfileHtml(walletData, pokerStats, spadesStats) {
    // ... (generate HTML for profile)
}



