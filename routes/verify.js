import express from 'express';
import { verifyWallet } from '../services/verify.js';

const router = express.Router();

// Add verify endpoint
router.post('/verify', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    console.log('Verifying wallet:', {
      userId: req.session.user.id,
      walletAddress,
    });

    // Verify the wallet
    const result = await verifyWallet(req.session.user.id, walletAddress);
    
    // Add formatted response for frontend
    const formattedResponse = `
      **Wallet Verification Successful!**
      Your wallet ${walletAddress.slice(0,4)}...${walletAddress.slice(-4)} has been verified.
      
      You can now use the following commands in Discord:
      • =my.profile - View your full profile
      • =my.wallet - View your connected wallets  
      • =my.nfts - View your NFT holdings
      • =my.roles - View your server roles
      • =my.bux - View your BUX balance
      
      Type =help in Discord for a full list of commands.
    `;

    // Return success response with formatted message
    res.json({ 
      success: true,
      message: 'Wallet verified successfully',
      formattedResponse,
      data: result
    });

  } catch (error) {
    console.error('Error in verify endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to verify wallet',
      details: error.message
    });
  }
});

export default router; 