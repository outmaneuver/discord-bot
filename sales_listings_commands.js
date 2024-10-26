import { testSale, testListing, testAllListings } from './sales_listings.js';

export async function handleSalesListingsCommands(message, client) {
  if (message.content === '!testsale') {
    await testSale(client);
  } else if (message.content === '!testlisting') {
    await testListing(client);
  } else if (message.content === '!testalllistings') {
    await testAllListings(client);
  }
  // Add other sales and listings related commands here
}
