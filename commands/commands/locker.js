const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('locker')
    .setDescription('Shows the Fortnite locker of a linked Epic account'),

  async execute(interaction, { userTokens, getAccountInfo }) {
    const discordId = interaction.user.id;

    // Check if user is linked
    const tokenData = userTokens.get(discordId);

    if (!tokenData) {
      return interaction.reply({
        content: '❌ You are not linked. Use **/link** first.',
        ephemeral: true
      });
    }

    await interaction.reply({
      content: '⏳ Fetching your Fortnite locker…',
      ephemeral: true
    });

    try {
      const accessToken = tokenData.access_token;
      const accountInfo = await getAccountInfo(accessToken);

      if (!accountInfo) {
        return interaction.followUp({
          content: '⚠️ Could not fetch account info. Token may be expired.',
          ephemeral: true
        });
      }

      // Rift-style placeholder embed until you connect the real FN API
      const embed = new EmbedBuilder()
        .setTitle(`${accountInfo.displayName}'s Locker`)
        .setColor('#2b2d31')
        .setThumbnail('https://cdn2.unrealengine.com/fortnite-og-meta-image-1920x1080-41ff10931c0d.jpg')
        .setDescription('✔️ Epic account linked successfully.\n\n⚠️ **Real locker data requires the FN Locker API**.\nThis embed will automatically update once you add that endpoint.')
        .addFields(
          { name: 'Skins', value: '`Loading…`', inline: true },
          { name: 'Pickaxes', value: '`Loading…`', inline: true },
          { name: 'Emotes', value: '`Loading…`', inline: true },
        );

      return interaction.followUp({
        embeds: [embed],
        ephemeral: true
      });

    } catch (err) {
      console.error(err);
      return interaction.followUp({
        content: '❌ Error fetching locker.',
        ephemeral: true
      });
    }
  }
};
