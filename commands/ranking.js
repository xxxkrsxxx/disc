const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Pokaż tygodniowy ranking aktywności w głosowaniach'),
  async execute(interaction) {
    const filePath = path.join(__dirname, '..', 'data', 'votes.json');
    if (!fs.existsSync(filePath)) return interaction.reply('Brak danych o głosowaniach.');

    const data = JSON.parse(fs.readFileSync(filePath));
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    const activity = {};

    for (const [date, users] of Object.entries(data)) {
      const voteDate = new Date(date);
      if (voteDate >= sevenDaysAgo) {
        users.forEach(id => {
          activity[id] = (activity[id] || 0) + 1;
        });
      }
    }

    const sorted = Object.entries(activity).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return interaction.reply('Brak głosów w ostatnich 7 dniach.');

    const embed = new EmbedBuilder()
      .setTitle('🏆 Tygodniowy Ranking Głosujących')
      .setColor('#FFD700');

    sorted.forEach(([id, count], index) => {
      embed.addFields({ name: `#${index + 1} <@${id}>`, value: `✅ ${count} głosów`, inline: false });
    });

    await interaction.reply({ embeds: [embed] });
  },
};
