import { EmbedBuilder } from 'discord.js';
import { redis } from '../config/redis.js';

class ActivityService {
    constructor(client) {
        this.client = client;
        this.nftActivityChannel = null;
        this.buxActivityChannel = null;
        this.initialize();
    }

    async initialize() {
        try {
            const guild = await this.client.guilds.fetch(process.env.GUILD_ID);
            this.nftActivityChannel = await guild.channels.fetch(process.env.NFT_ACTIVITY_CHANNEL_ID);
            this.buxActivityChannel = await guild.channels.fetch(process.env.BUX_ACTIVITY_CHANNEL_ID);
            console.log('Activity channels initialized:', {
                nft: this.nftActivityChannel?.id,
                bux: this.buxActivityChannel?.id
            });
        } catch (error) {
            console.error('Error initializing activity channels:', error);
        }
    }

    async postNFTActivity(event) {
        if (!this.nftActivityChannel) return;

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('NFT Activity')
            .addFields(
                { name: 'Type', value: event.type },
                { name: 'Collection', value: event.collection },
                { name: 'NFT', value: `[${event.mint}](https://solscan.io/token/${event.mint})` },
                { name: 'New Owner', value: `[${event.newOwner}](https://solscan.io/account/${event.newOwner})` }
            )
            .setTimestamp();

        if (event.oldOwner) {
            embed.addFields({ 
                name: 'Previous Owner', 
                value: `[${event.oldOwner}](https://solscan.io/account/${event.oldOwner})` 
            });
        }

        if (event.price) {
            embed.addFields({ name: 'Price', value: `${event.price} SOL` });
        }

        await this.nftActivityChannel.send({ embeds: [embed] });
    }

    async postBUXActivity(event) {
        if (!this.buxActivityChannel) return;

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('BUX Activity')
            .addFields(
                { name: 'Type', value: event.type },
                { name: 'Wallet', value: `[${event.wallet}](https://solscan.io/account/${event.wallet})` },
                { name: 'Amount', value: `${(event.change / 1e9).toLocaleString()} BUX` },
                { name: 'New Balance', value: `${(event.newBalance / 1e9).toLocaleString()} BUX` }
            )
            .setTimestamp();

        await this.buxActivityChannel.send({ embeds: [embed] });
    }
}

export { ActivityService }; 