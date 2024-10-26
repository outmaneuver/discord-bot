app.post('/holder-verify/verify', async (req, res) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({ success: false, error: 'Wallet address is required' });
    }

    console.log(`Verifying wallet: ${walletAddress}`);

    console.log('Checking NFT ownership...');
    const nftCounts = await checkNFTOwnership(walletAddress);
    console.log('NFT ownership check complete:', JSON.stringify(nftCounts, null, 2));

    console.log('Getting BUX balance...');
    const buxBalance = await getBUXBalance(walletAddress);
    console.log('BUX balance retrieved:', buxBalance);

    console.log('Updating Discord roles...');
    const rolesUpdated = await updateDiscordRoles(client, req.user.id, nftCounts, buxBalance, walletAddress);
    console.log('Discord roles update complete');

    console.log('Verification results:');
    console.log('NFT Counts:', JSON.stringify(nftCounts, null, 2));
    console.log('BUX Balance:', buxBalance);
    console.log('Roles Updated:', rolesUpdated);

    // Calculate potential daily staking yield
    const dailyYield = calculateDailyYield(nftCounts);

    // Format the response
    const formattedBuxBalance = buxBalance;
    let response = `Hi ${req.user.username}!\n\nVERIFIED ASSETS:\n`;
    response += `Fcked Catz - ${nftCounts['fcked_catz'] ? nftCounts['fcked_catz'].length : 0}\n`;
    response += `Celeb Catz - ${nftCounts['celebcatz'] ? nftCounts['celebcatz'].length : 0}\n`;
    response += `Money Monsters - ${nftCounts['money_monsters'] ? nftCounts['money_monsters'].length : 0}\n`;
    response += `Money Monsters 3D - ${nftCounts['money_monsters3d'] ? nftCounts['money_monsters3d'].length : 0}\n`;
    response += `A.I. BitBots - ${nftCounts['ai_bitbots'] ? nftCounts['ai_bitbots'].length : 0}\n`;
    response += `$BUX - ${formattedBuxBalance}\n\n`;
    response += `Potential daily staking yield = ${dailyYield} $BUX`;

    res.json({ 
      success: true, 
      rolesUpdated,
      nftCounts,
      buxBalance,
      dailyYield,
      formattedResponse: response
    });
  } catch (error) {
    console.error('Error during wallet verification:', error);
    res.status(500).json({ success: false, error: 'Internal server error', details: error.message });
  }
});
