const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your Epic Games account."),

  async execute(interaction, helper) {
    const discordId = interaction.user.id;

    // Build Epic login URL using the helper in server.js
    const url = helper.buildEpicAuthUrl(discordId);

    const button = new ButtonBuilder()
      .setLabel("Log in with Epic")
      .setStyle(ButtonStyle.Link)
      .setURL(url);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({
      content:
        "🔗 Click below to **log in with Epic Games** and link your account.",
      components: [row],
      ephemeral: true,
    });
  },
};
