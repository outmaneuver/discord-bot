import express from 'express';
import { verifyWallet, updateDiscordRoles } from '../services/verify.js';
import { redis } from '../config/redis.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many verification requests, please try again later'
});

router.post('/verify', verifyLimiter, async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Not authenticated',
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

    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ 
        success: false, 
        error: 'Wallet address required',
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

    const result = await verifyWallet(req.session.user.id, walletAddress);

    if (result.success) {
      console.log('Verification successful, updating Discord roles...');
      try {
        await updateDiscordRoles(req.session.user.id, global.discordClient);
        console.log('Discord roles updated successfully');
      } catch (error) {
        console.error('Error updating Discord roles:', error);
        // Don't fail the request if role update fails
      }
    }

    res.json(result);

  } catch (error) {
    console.error('Verify error:', error.message);
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

router.post('/store-wallet', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    await redis.sadd(`wallets:${req.session.user.id}`, walletAddress);
    
    res.json({ 
      success: true,
      message: 'Wallet stored successfully',
      data: {
        userId: req.session.user.id,
        walletAddress
      }
    });

  } catch (error) {
    console.error('Store wallet error:', error.message);
    res.status(500).json({ 
      error: 'Failed to store wallet',
      details: error.message
    });
  }
});

export default router; 