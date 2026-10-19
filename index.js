
require('dotenv').config();

const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  STORE_NAME = 'MAISIE STORE',
  STAFF_ROLE_ID = '',
  TICKET_CATEGORY_ID = '',
} = process.env;

// Check required configuration
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error(
    'Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID in Render Environment.'
  );
  process.exit(1);
}

// Render Free Web Service HTTP server
const app = express();

app.get('/', (req, res) => {
  res.status(200).send(`${STORE_NAME} Discord Bot is running!`);
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const server = app.listen(process.env.PORT || 10000, '0.0.0.0', () => {
  console.log('HTTP server started.');
});

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// Store settings for welcome messages in memory.
// These settings reset when the service restarts.
const settings = new Map();

function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x57B9FF)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: STORE_NAME })
    .setTimestamp();
}

// Slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('msay')
    .setDescription('Send a store announcement')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Announcement message')
        .setRequired(true)
        .setMaxLength(1900))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('vouch')
    .setDescription('Post a customer vouch')
    .addUserOption(option =>
      option.setName('customer')
        .setDescription('Customer who gave the vouch')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('product')
        .setDescription('Product or service')
        .setRequired(true)
        .setMaxLength(200))
    .addStringOption(option =>
      option.setName('review')
        .setDescription('Customer review')
        .setRequired(true)
        .setMaxLength(1000)),

  new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure automatic welcome messages')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Welcome channel')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Use {user} to mention the new member')
        .setRequired(true)
        .setMaxLength(1000))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('proof')
    .setDescription('Post order proof')
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Describe the proof')
        .setRequired(true)
        .setMaxLength(1000))
    .addAttachmentOption(option =>
      option.setName('image')
        .setDescription('Optional proof screenshot'))
    .addStringOption(option =>
      option.setName('image_url')
        .setDescription('Optional public image URL')),

  new SlashCommandBuilder()
    .setName('feed')
    .setDescription('Post customer feedback')
    .addIntegerOption(option =>
      option.setName('rating')
        .setDescription('Rating from 1 to 5')
        .setMinValue(1)
        .setMaxValue(5)
        .setRequired(true))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Feedback message')
        .setRequired(true)
        .setMaxLength(1000)),

  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Post the private support ticket panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map(command => command.toJSON());

// Register commands to the configured server
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  console.log('Registering commands for application:', CLIENT_ID);
  console.log('Target Discord server:', GUILD_ID);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log('All 6 slash commands registered successfully.');
}

// Automatic welcome messages
client.on(Events.GuildMemberAdd, async member => {
  try {
    const config = settings.get(member.guild.id);
    if (!config) return;

    const channel = await member.guild.channels
      .fetch(config.channelId)
      .catch(() => null);

    if (!channel || !channel.isTextBased()) return;

    const message = config.message.replaceAll(
      '{user}',
      `<@${member.id}>`
    );

    await channel.send({
      embeds: [makeEmbed(`Welcome to ${STORE_NAME}!`, message)],
      allowedMentions: { users: [member.id] },
    });
  } catch (error) {
    console.error('Welcome message error:', error);
  }
});

client.once(Events.ClientReady, readyClient => {
  console.log(`Bot online as ${readyClient.user.tag}`);
});

// Handle commands and ticket buttons
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = interaction.commandName;

      // /msay
      if (command === 'msay') {
        const message = interaction.options.getString('message', true);

        await interaction.channel.send({
          content: message,
          allowedMentions: { parse: [] },
        });

        return interaction.reply({
          content: 'Announcement sent!',
          ephemeral: true,
        });
      }

      // /vouch
      if (command === 'vouch') {
        const customer = interaction.options.getUser('customer', true);
        const product = interaction.options.getString('product', true);
        const review = interaction.options.getString('review', true);

        const embed = makeEmbed('⭐ Customer Vouch', review)
          .addFields(
            { name: 'Customer', value: customer.tag },
            { name: 'Product / Service', value: product },
            { name: 'Submitted by', value: interaction.user.tag }
          );

        return interaction.reply({ embeds: [embed] });
      }

      // /welcome
      if (command === 'welcome') {
        const channel = interaction.options.getChannel('channel', true);
        const message = interaction.options.getString('message', true);

        settings.set(interaction.guildId, {
          channelId: channel.id,
          message,
        });

        return interaction.reply({
          content:
            `Welcome messages configured for ${channel}.\n` +
            'Use {user} in the message to mention new members.\n' +
            'Note: this configuration resets if the bot restarts.',
          ephemeral: true,
        });
      }

      // /proof
      if (command === 'proof') {
        const description =
          interaction.options.getString('description', true);
        const attachment = interaction.options.getAttachment('image');
        const imageUrl = interaction.options.getString('image_url');

        if (attachment && imageUrl) {
          return interaction.reply({
            content: 'Choose an attachment OR an image URL, not both.',
            ephemeral: true,
          });
        }

        const url = attachment?.url || imageUrl;

        if (url && !/^https?:\/\/\S+$/i.test(url)) {
          return interaction.reply({
            content: 'Please provide a valid HTTP or HTTPS image URL.',
            ephemeral: true,
          });
        }

        const embed = makeEmbed('📸 Order Proof', description)
          .addFields({ name: 'Posted by', value: interaction.user.tag });

        if (url) embed.setImage(url);

        return interaction.reply({ embeds: [embed] });
      }

      // /feed
      if (command === 'feed') {
        const rating = interaction.options.getInteger('rating', true);
        const message = interaction.options.getString('message', true);
        const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);

        const embed = makeEmbed('💬 Customer Feedback', message)
          .addFields(
            { name: 'Rating', value: `${stars} (${rating}/5)` },
            { name: 'Customer', value: interaction.user.tag }
          );

        return interaction.reply({ embeds: [embed] });
      }

      // /ticket
      if (command === 'ticket') {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('store_ticket_open')
            .setLabel('Open Ticket')
            .setEmoji('🎫')
            .setStyle(ButtonStyle.Primary)
        );

        await interaction.channel.send({
          embeds: [
            makeEmbed(
              `${STORE_NAME} — Support`,
              'Need help with an order? Click below to open a private ticket.'
            ),
          ],
          components: [row],
        });

        return interaction.reply({
          content: 'Ticket panel posted!',
          ephemeral: true,
        });
      }
    }

    // Ticket buttons
    if (interaction.isButton()) {
      // Open ticket
      if (interaction.customId === 'store_ticket_open') {
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        if (!guild) {
          return interaction.editReply('Use this button inside a server.');
        }

        const existing = guild.channels.cache.find(channel =>
          channel.type === ChannelType.GuildText &&
          channel.topic === `store-ticket:${interaction.user.id}`
        );

        if (existing) {
          return interaction.editReply(`You already have a ticket: ${existing}`);
        }

        const overwrites = [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
            ],
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
            ],
          },
        ];

        // Give the configured staff role access to tickets
        if (STAFF_ROLE_ID) {
          const staffRole = await guild.roles
            .fetch(STAFF_ROLE_ID)
            .catch(() => null);

          if (staffRole) {
            overwrites.push({
              id: staffRole.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks,
              ],
            });
          } else {
            console.warn('STAFF_ROLE_ID was not found in this server.');
          }
        }

        let parentId;

        if (TICKET_CATEGORY_ID) {
          const category = await guild.channels
            .fetch(TICKET_CATEGORY_ID)
            .catch(() => null);

          if (category?.type === ChannelType.GuildCategory) {
            parentId = category.id;
          } else {
            console.warn('TICKET_CATEGORY_ID is not a valid category.');
          }
        }

        const safeName = interaction.user.username
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 80) || 'customer';

        const ticket = await guild.channels.create({
          name: `ticket-${safeName}`,
          type: ChannelType.GuildText,
          topic: `store-ticket:${interaction.user.id}`,
          ...(parentId ? { parent: parentId } : {}),
          permissionOverwrites: overwrites,
        });

        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('store_ticket_close')
            .setLabel('Close Ticket')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger)
        );

        await ticket.send({
          content: `<@${interaction.user.id}> Welcome! Describe your order or issue here.`,
          embeds: [
            makeEmbed('🎫 Support Ticket', 'A staff member will assist you soon.'),
          ],
          components: [closeRow],
          allowedMentions: { users: [interaction.user.id] },
        });

        return interaction.editReply(`Your ticket has been created: ${ticket}`);
      }

      // Close ticket
      if (interaction.customId === 'store_ticket_close') {
        const channel = interaction.channel;
        const prefix = 'store-ticket:';

        if (!channel?.topic?.startsWith(prefix)) {
          return interaction.reply({
            content: 'This is not a store ticket.',
            ephemeral: true,
          });
        }

        const ownerId = channel.topic.slice(prefix.length);
        const isOwner = interaction.user.id === ownerId;
        const isStaff = Boolean(
          STAFF_ROLE_ID &&
          interaction.member?.roles?.cache?.has(STAFF_ROLE_ID)
        );
        const canManage = interaction.memberPermissions?.has(
          PermissionFlagsBits.ManageChannels
        );

        if (!isOwner && !isStaff && !canManage) {
          return interaction.reply({
            content: 'Only the ticket owner or authorized staff can close this ticket.',
            ephemeral: true,
          });
        }

        await interaction.reply('Ticket closing in 3 seconds.');

        setTimeout(() => {
          channel.delete('Store support ticket closed').catch(console.error);
        }, 3000);
      }
    }
  } catch (error) {
    console.error('Interaction error:', error);

    if (interaction.isRepliable()) {
      const message = 'An error occurred. Check the Render logs for details.';

      if (interaction.deferred) {
        await interaction.editReply(message).catch(() => {});
      } else if (!interaction.replied) {
        await interaction.reply({
          content: message,
          ephemeral: true,
        }).catch(() => {});
      }
    }
  }
});

// Start bot
(async () => {
  try {
    await registerCommands();
    await client.login(DISCORD_TOKEN);
  } catch (error) {
    console.error('Bot startup failed:', error);
    server.close();
    process.exit(1);
  }
})();
