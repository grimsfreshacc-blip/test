const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const fetch = require('node-fetch');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('locker')
    .setDescription('Shows your full Fortnite locker with pages.'),

  async execute(interaction, helper) {
    const { userTokens, getAccountInfo } = helper;
    const discordId = interaction.user.id;

    const tokens = userTokens.get(discordId);
    if (!tokens) {
      return interaction.reply({
        content: "❌ You are **not logged in**.\nUse `/link` first.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // Step 1 — Get Epic ID
      const account = await getAccountInfo(tokens.access_token);
      if (!account || !account.id) {
        return interaction.editReply("❌ Could not fetch your Epic account.");
      }

      const accountId = account.id;

      // Step 2 — Fetch locker
      const locker = await (
        await fetch(`https://benbot.app/api/v1/locker/${accountId}`)
      ).json();

      const skins =
        locker.items?.filter((i) => i.type?.value === 'outfit') || [];

      if (!skins.length) {
        return interaction.editReply("❌ No skins found in locker.");
      }

      // Sort skins alphabetically
      skins.sort((a, b) => a.name.localeCompare(b.name));

      // Pagination setup
      let page = 0;
      const pageSize = 1; // ONE SKIN PER PAGE (like Rift)
      const maxPages = skins.length;

      const generateEmbed = () => {
        const skin = skins[page];

        return new EmbedBuilder()
          .setTitle(`${account.displayName}'s Locker`)
          .setColor(0x00a6ff)
          .setThumbnail(skin.images.icon || skin.images.smallIcon)
          .addFields(
            { name: "Skin", value: skin.name },
            { name: "Rarity", value: skin.rarity?.value || "Unknown", inline: true }
          )
          .setImage(skin.images.featured || skin.images.icon)
          .setFooter({ text: `Skin ${page + 1} / ${maxPages}` });
      };

      const row = () =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('prev')
            .setLabel('⬅️ Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId('next')
            .setLabel('Next ➡️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === maxPages - 1)
        );

      // Initial reply
      const message = await interaction.editReply({
        embeds: [generateEmbed()],
        components: [row()],
      });

      // Collector
      const collector = message.createMessageComponentCollector({
        time: 1000 * 60 * 5, // 5 minutes
      });

      collector.on('collect', async (btn) => {
        if (btn.user.id !== discordId) {
          return btn.reply({
            content: "❌ This is not your locker.",
            ephemeral: true,
          });
        }

        if (btn.customId === 'next' && page < maxPages - 1) page++;
        if (btn.customId === 'prev' && page > 0) page--;

        await btn.update({
          embeds: [generateEmbed()],
          components: [row()],
        });
      });

      collector.on('end', async () => {
        try {
          await message.edit({ components: [] });
        } catch {}
      });

    } catch (err) {
      console.error(err);
      return interaction.editReply("❌ Error loading locker.");
    }
  },
};
