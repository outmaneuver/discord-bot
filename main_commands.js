export async function handleMainCommands(message, client) {
  console.log('Received message:', message.content);
  if (message.content.toLowerCase() === '!help') {
    console.log('Handling !help command');
    const commands = [
      { name: '!help', description: 'Show this help message' },
      { name: '!profile', description: 'View your profile' },
      { name: '!profile @user', description: 'View another user\'s profile (Admin only)' },
      { name: '!verify', description: 'Get a link to verify your wallet' },
      { name: '!testsale', description: 'Test a sale notification (Admin only)' },
      { name: '!testlisting', description: 'Test a listing notification (Admin only)' },
      { name: '!testalllistings', description: 'Test all listing notifications (Admin only)' },
      { name: '!sendverification', description: 'Send a verification message to the channel (Admin only)' }
    ];

    const helpEmbed = {
      color: 0x0099ff,
      title: 'BUX DAO Bot Commands',
      description: 'Here are the available commands:',
      fields: commands.map(cmd => ({
        name: cmd.name,
        value: cmd.description
      })),
      footer: { text: 'BUX DAO Bot' },
      timestamp: new Date()
    };

    await message.channel.send({ embeds: [helpEmbed] });
  }
  // Add other main commands here
}
