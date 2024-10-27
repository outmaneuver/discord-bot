import { testSale, testListing, testAllListings } from './sales_listings.js';

export async function handleSalesListingsCommands(message, client) {
  if (message.member.permissions.has('ADMINISTRATOR')) {
    if (message.content.toLowerCase() === '=testsale') {
      await testSale(client);
      await message.reply('Test sale notification sent.');
    } else if (message.content.toLowerCase() === '=testlisting') {
      await testListing(client);
      await message.reply('Test listing notification sent.');
    } else if (message.content.toLowerCase() === '=testalllistings') {
      await testAllListings(client);
      await message.reply('All test listing notifications sent.');
    }
  }
  // Update other sales and listings related commands here
}
