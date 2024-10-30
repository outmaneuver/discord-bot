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
    
    // Return success response
    res.json({ 
      success: true,
      message: 'Wallet verified successfully',
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