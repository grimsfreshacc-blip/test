const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your Epic Games account"),

  async execute(interaction, { buildEpicAuthUrl }) {
    try {
      // Prevents Discord from timing out
      await interaction.deferReply({ ephemeral: true });

      const discordId = interaction.user.id;

      // Generate Epic login URL
      const authUrl = buildEpicAuthUrl(discordId);

      await interaction.editReply({
        content: `🔗 **Click below to link your Epic Games account:**\n${authUrl}`,
        ephemeral: true,
      });
    } catch (error) {
      console.error("Error in /link command:", error);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("❌ Could not generate login link.");
      } else {
        await interaction.reply({
          content: "❌ Could not generate login link.",
          ephemeral: true,
        });
      }
    }
  },
};
