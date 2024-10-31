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
    const formattedResponse = `
      **Wallet Verification Successful!**
      
      VERIFIED NFTs
     
      Fcked Catz - ${result.nftCounts?.fcked_catz || 0}
      Celeb Catz - ${result.nftCounts?.celebcatz || 0}
      Monsters - ${result.nftCounts?.money_monsters || 0}
      3D Monsters - ${result.nftCounts?.money_monsters3d || 0}
      BitBots - ${result.nftCounts?.ai_bitbots || 0}
      
      A.I. collabs - ${(result.nftCounts?.warriors || 0) + 
                      (result.nftCounts?.squirrels || 0) + 
                      (result.nftCounts?.rjctd_bots || 0) + 
                      (result.nftCounts?.energy_apes || 0) + 
                      (result.nftCounts?.doodle_bots || 0) + 
                      (result.nftCounts?.candy_bots || 0)}

      **Daily reward - ${result.dailyReward || 0} BUX**
    `;

    // Send success response immediately
    res.json({ 
      success: true,
      message: 'Wallet verified successfully',
      formattedResponse,
      data: result
    });

    // Update Discord roles in background
    updateDiscordRoles(req.session.user.id, global.discordClient)
      .catch(error => {
        console.error('Background role update failed:', error);
      });

  } catch (error) {
    console.error('Error in verify endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to verify wallet',
      details: error.message
    });
  }
});

// Add store-wallet endpoint
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