import WebSocket from 'ws';
import { tokenDB } from './database.js';
import { ActivityService } from './activity.js';

class WebSocketService {
    constructor(client) {
        this.ws = null;
        this.activityService = new ActivityService(client);
        this.initialize();
    }

    initialize() {
        // Connect to Solana mainnet-beta websocket endpoint
        this.ws = new WebSocket(process.env.SOLANA_WS_URL);

        this.ws.on('open', () => {
            console.log('WebSocket connected');
            this.subscribeToPrograms();
        });

        this.ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data);
                if (message.method === 'programNotification') {
                    await this.handleProgramNotification(message.params);
                }
            } catch (error) {
                console.error('WebSocket message error:', error);
            }
        });

        this.ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });

        this.ws.on('close', () => {
            console.log('WebSocket closed, reconnecting...');
            setTimeout(() => this.initialize(), 5000);
        });
    }

    subscribeToPrograms() {
        // Subscribe to Token Program
        this.ws.send(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'programSubscribe',
            params: [
                'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
                { encoding: 'jsonParsed', commitment: 'confirmed' }
            ]
        }));
    }

    async handleProgramNotification(params) {
        const { result } = params;
        if (!result || !result.value) return;

        const { accountId, value } = result;
        
        // Handle NFT transfers
        if (value.lamports === 0 && value.data.parsed?.type === 'transfer') {
            const { info } = value.data.parsed;
            await this.handleNFTTransfer(info);
        }
        
        // Handle BUX transfers
        if (accountId === process.env.BUX_TOKEN_MINT) {
            await this.handleBUXTransfer(value.data.parsed?.info);
        }
    }

    async handleNFTTransfer(info) {
        const { mint, owner, source } = info;
        await tokenDB.updateNFTOwnership(mint, owner, source);
        await this.activityService.postNFTActivity({
            type: 'transfer',
            mint,
            newOwner: owner,
            oldOwner: source
        });
    }

    async handleBUXTransfer(info) {
        if (!info) return;
        const { owner, amount } = info;
        await tokenDB.updateBUXBalance(owner, amount);
        await this.activityService.postBUXActivity({
            type: 'transfer',
            wallet: owner,
            amount
        });
    }
}

export { WebSocketService }; 