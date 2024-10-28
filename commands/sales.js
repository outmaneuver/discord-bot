import { testSale, testListing, testAllListings } from './sales_listings.js';
import { PermissionsBitField } from 'discord.js';

export async function handleSalesListingsCommands(message) {
  // Check if user has administrator permissions
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return;
  }

  if (message.content.toLowerCase() === '=testsale') {
    await testSale(message.client);
    await message.reply('Test sale notification sent.');
  } else if (message.content.toLowerCase() === '=testlisting') {
    await testListing(message.client);
    await message.reply('Test listing notification sent.');
  } else if (message.content.toLowerCase() === '=testalllistings') {
    await testAllListings(message.client);
    await message.reply('All test listing notifications sent.');
  }
  // Update other sales and listings related commands here
}
