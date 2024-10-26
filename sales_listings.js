import { Client, EmbedBuilder } from 'discord.js';
import fetch from 'node-fetch';

const COLLECTIONS = process.env.COLLECTIONS.split(',');
const SALES_CHANNEL_ID = process.env.SALES_CHANNEL_ID;
const LISTINGS_CHANNEL_ID = process.env.LISTINGS_CHANNEL_ID;

const lastKnownState = {};

export function initializeSalesListings(client) {
    COLLECTIONS.forEach(collection => {
        lastKnownState[collection] = { lastListingTime: 0, lastSaleTime: 0 };
    });
    
    setInterval(() => checkCollections(client), 1 * 60 * 1000); // Check every 1 minute
}

async function checkCollections(client) {
    // ... (existing checkCollections function)
}

export async function testSale(client, collection) {
    // ... (existing testSale function)
}

export async function testListing(client, collection) {
    // ... (existing testListing function)
}

export async function testAllListings(client) {
    // ... (existing testAllListings function)
}
