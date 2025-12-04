const {
  SlashCommandBuilder,
  EmbedBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("login")
    .setDescription("Login to your Epic Games account."),

  async execute(interaction, helper) {
    const discordId = interaction.user.id;

    // Build the login URL from helper
    const url = helper.buildEpicAuthUrl(discordId);

    const embed = new EmbedBuilder()
      .setTitle("Epic Games Login")
      .setDescription(
        `Click the button below to login and link your Epic account.\n\n` +
        `🔗 [Login Here](${url})`
      )
      .setColor(0x00aaff);

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  },
};
