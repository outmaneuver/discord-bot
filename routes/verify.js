import express from 'express';
import { verifyWallet, updateDiscordRoles } from '../services/verify.js';
import { redis } from '../config/redis.js';

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

    // Verify the wallet first
    const result = await verifyWallet(req.session.user.id, walletAddress);
    
    // Format response before role update
    const response = {
      success: true,
      message: 'Wallet verified successfully',
      data: {
        nftCounts: result.data.nftCounts,
        buxBalance: result.data.buxBalance,
        dailyReward: result.data.dailyReward
      },
      formattedResponse: result.formattedResponse
    };

    // Send success response immediately
    res.json(response);

    // Update Discord roles in background
    updateDiscordRoles(req.session.user.id, global.discordClient)
      .catch(error => {
        console.error('Background role update failed:', error);
      });

  } catch (error) {
    console.error('Error in verify endpoint:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to verify wallet',
      details: error.message,
      data: {
        nftCounts: {
          fcked_catz: 0,
          celebcatz: 0,
          money_monsters: 0,
          money_monsters3d: 0,
          ai_bitbots: 0,
          warriors: 0,
          squirrels: 0,
          rjctd_bots: 0,
          energy_apes: 0,
          doodle_bots: 0,
          candy_bots: 0
        },
        buxBalance: 0,
        dailyReward: 0
      }
    });
  }
});

// Update store-wallet endpoint path to match frontend
router.post('/store-wallet', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    console.log('Storing wallet:', {
      userId: req.session.user.id,
      walletAddress,
    });

    // Store wallet in Redis
    await redis.sadd(`wallets:${req.session.user.id}`, walletAddress);
    
    // Return success response
    res.json({ 
      success: true,
      message: 'Wallet stored successfully',
      data: {
        userId: req.session.user.id,
        walletAddress
      }
    });

  } catch (error) {
    console.error('Error storing wallet:', error);
    res.status(500).json({ 
      error: 'Failed to store wallet',
      details: error.message
    });
  }
});

export default router; 