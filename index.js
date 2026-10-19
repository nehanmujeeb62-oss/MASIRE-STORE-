
require('dotenv').config();
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

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
  WELCOME_CHANNEL_ID = '',
  TICKET_CATEGORY_ID = '',
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('ERROR: Fill in DISCORD_TOKEN, CLIENT_ID and GUILD_ID in .env');
  process.exit(1);
}

const settingsPath = path.join(__dirname, 'settings.json');

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return {};
  }
}

const settings = loadSettings();

function saveSettings() {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function storeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x57B9FF)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: STORE_NAME })
    .setTimestamp();
}

const commands = [
  new SlashCommandBuilder()
    .setName('msay')
    .setDescription('Send a store announcement')
    .addStringOption(o =>
      o.setName('message')
        .setDescription('Message to send')
        .setRequired(true)
        .setMaxLength(1900))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('vouch')
    .setDescription('Post a customer vouch')
    .addUserOption(o =>
      o.setName('customer')
        .setDescription('Customer who gave the vouch')
        .setRequired(true))
    .addStringOption(o =>
      o.setName('product')
        .setDescription('Product or service purchased')
        .setRequired(true)
        .setMaxLength(200))
    .addStringOption(o =>
      o.setName('review')
        .setDescription('Customer review')
        .setRequired(true)
        .setMaxLength(1000)),

  new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure the automatic welcome message')
    .addChannelOption(o =>
      o.setName('channel')
        .setDescription('Channel for welcome messages')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true))
    .addStringOption(o =>
      o.setName('message')
        .setDescription('Use {user} to mention the new member')
        .setRequired(true)
        .setMaxLength(1000))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('proof')
    .setDescription('Post a proof embed')
    .addStringOption(o =>
      o.setName('description')
        .setDescription('Describe the proof')
        .setRequired(true)
        .setMaxLength(1000))
    .addAttachmentOption(o =>
      o.setName('image')
        .setDescription('Optional proof screenshot'))
    .addStringOption(o =>
      o.setName('image_url')
        .setDescription('Optional public image URL')),

  new SlashCommandBuilder()
    .setName('feed')
    .setDescription('Post customer feedback')
    .addIntegerOption(o =>
      o.setName('rating')
        .setDescription('Rating from 1 to 5')
        .setMinValue(1)
        .setMaxValue(5)
        .setRequired(true))
    .addStringOption(o =>
      o.setName('message')
        .setDescription('Your feedback')
        .setRequired(true)
        .setMaxLength(1000)),

  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Create a private support ticket panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map(command => command.toJSON());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log('All 6 slash commands registered successfully.');
}

client.once(Events.ClientReady, readyClient => {
  console.log(`Bot online as ${readyClient.user.tag}`);
});

client.on(Events.GuildMemberAdd, async member => {
  try {
    const config = settings[member.guild.id] || {};
    const channelId = config.welcomeChannelId || WELCOME_CHANNEL_ID;
    const message = config.welcomeMessage ||
      'Welcome {user} to our server! Enjoy your stay.';

    if (!channelId) return;

    const channel = await member.guild.channels.fetch(channelId)
      .catch(() => null);

    if (!channel || !channel.isTextBased()) return;

    const safeMessage = message.replaceAll('{user}', member.toString());

    await channel.send({
      embeds: [
        storeEmbed('Welcome to ' + STORE_NAME, safeMessage),
      ],
      allowedMentions: { users: [member.id] },
    });
  } catch (error) {
    console.error('Welcome error:', error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      if (commandName === 'msay') {
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

      if (commandName === 'vouch') {
        const customer = interaction.options.getUser('customer', true);
        const product = interaction.options.getString('product', true);
        const review = interaction.options.getString('review', true);

        const embed = storeEmbed('⭐ Customer Vouch', review)
          .addFields(
            { name: 'Customer', value: customer.tag },
            { name: 'Product / Service', value: product },
            { name: 'Posted by', value: interaction.user.tag }
          );

        await interaction.reply({ embeds: [embed] });
        return;
      }

      if (commandName === 'welcome') {
        const channel = interaction.options.getChannel('channel', true);
        const message = interaction.options.getString('message', true);

        settings[interaction.guildId] = {
          ...(settings[interaction.guildId] || {}),
          welcomeChannelId: channel.id,
          welcomeMessage: message,
        };

        saveSettings();

        await interaction.reply({
          content: `Welcome messages configured for ${channel}.\nUse {user} in the message to mention new members.`,
          ephemeral: true,
        });
        return;
      }

      if (commandName === 'proof') {
        const description =
          interaction.options.getString('description', true);
        const attachment = interaction.options.getAttachment('image');
        const imageUrl = interaction.options.getString('image_url');

        if (attachment && imageUrl) {
          return interaction.reply({
            content: 'Choose either an image attachment or an image URL, not both.',
            ephemeral: true,
          });
        }

        const url = attachment?.url || imageUrl;

        if (url && !/^https?:\/\/\S+$/i.test(url)) {
          return interaction.reply({
            content: 'Please provide a valid public HTTP or HTTPS image URL.',
            ephemeral: true,
          });
        }

        const embed = storeEmbed('📸 Order Proof', description)
          .addFields({ name: 'Posted by', value: interaction.user.tag });

        if (url) embed.setImage(url);

        await interaction.reply({ embeds: [embed] });
        return;
      }

      if (commandName === 'feed') {
        const rating = interaction.options.getInteger('rating', true);
        const message = interaction.options.getString('message', true);
        const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);

        const embed = storeEmbed('💬 Customer Feedback', message)
          .addFields(
            { name: 'Rating', value: `${stars} (${rating}/5)` },
            { name: 'Customer', value: interaction.user.tag }
          );

        await interaction.reply({ embeds: [embed] });
        return;
      }

      if (commandName === 'ticket') {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('store_ticket_open')
            .setLabel('Open Ticket')
            .setEmoji('🎫')
            .setStyle(ButtonStyle.Primary)
        );

        await interaction.channel.send({
          embeds: [
            storeEmbed(
              `${STORE_NAME} — Support`,
              'Need help with an order or product? Click below to open a private support ticket.'
            ),
          ],
          components: [row],
        });

        await interaction.reply({
          content: 'Ticket panel posted!',
          ephemeral: true,
        });
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'store_ticket_open') {
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        if (!guild) {
          return interaction.editReply('This button must be used in a server.');
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

        const ticketConfig = settings[guild.id] || {};
        const categoryId = ticketConfig.ticketCategoryId || TICKET_CATEGORY_ID;

        if (categoryId) {
          const category = await guild.channels.fetch(categoryId)
            .catch(() => null);

          if (category?.type === ChannelType.GuildCategory) {
            // The channel will be created under this category.
          }
        }

        const ticket = await guild.channels.create({
          name: `ticket-${interaction.user.username}`
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .slice(0, 90),
          type: ChannelType.GuildText,
          topic: `store-ticket:${interaction.user.id}`,
          ...(categoryId ? { parent: categoryId } : {}),
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
          content: `${interaction.user} Welcome! Please describe your order or issue.`,
          embeds: [
            storeEmbed('🎫 Support Ticket', 'A staff member will assist you soon.'),
          ],
          components: [closeRow],
          allowedMentions: { users: [interaction.user.id] },
        });

        return interaction.editReply(`Your ticket has been created: ${ticket}`);
      }

      if (interaction.customId === 'store_ticket_close') {
        const isTicket = interaction.channel?.topic?.startsWith('store-ticket:');

        if (!isTicket) {
          return interaction.reply({
            content: 'This is not a store ticket.',
            ephemeral: true,
          });
        }

        const ticketOwnerId = interaction.channel.topic.slice(
          'store-ticket:'.length
        );

        const isOwner = interaction.user.id === ticketOwnerId;
        const canManage = interaction.memberPermissions?.has(
          PermissionFlagsBits.ManageChannels
        );

        if (!isOwner && !canManage) {
          return interaction.reply({
            content: 'Only the ticket owner or staff with Manage Channels can close this ticket.',
            ephemeral: true,
          });
        }

        await interaction.reply('Ticket closing in 3 seconds.');

        setTimeout(() => {
          interaction.channel.delete('Store support ticket closed')
            .catch(console.error);
        }, 3000);
      }
    }
  } catch (error) {
    console.error('Interaction error:', error);

    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Something went wrong. Check the bot console for details.',
        ephemeral: true,
      }).catch(() => {});
    } else if (interaction.isRepliable() && interaction.deferred) {
      await interaction.editReply('Something went wrong. Check the bot console for details.')
        .catch(() => {});
    }
  }
});

(async () => {
  try {
    await registerCommands();
    await client.login(DISCORD_TOKEN);
  } catch (error) {
    console.error('Bot startup failed:', error);
  }
})();
