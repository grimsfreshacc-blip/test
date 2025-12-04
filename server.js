require('dotenv').config();

const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store tokens in memory
const userTokens = new Map();
const oauthState = new Map();

// ---------- Epic OAuth ----------
const EPIC = {
  clientId: process.env.EPIC_CLIENT_ID,
  clientSecret: process.env.EPIC_CLIENT_SECRET,
  redirectUri: process.env.EPIC_REDIRECT_URI,
  authUrl: 'https://www.epicgames.com/id/authorize',
  tokenUrl: 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token'
};

// Build Epic Games login URL
function buildEpicAuthUrl(discordId, returnTo = '/') {
  const state = `${discordId}:${uuidv4()}`;
  oauthState.set(state, { discordId, returnTo, created: Date.now() });

  const params = new URLSearchParams({
    client_id: EPIC.clientId,
    response_type: 'code',
    scope: 'basic_profile',
    redirect_uri: EPIC.redirectUri,
    state
  });

  return `${EPIC.authUrl}?${params.toString()}`;
}

// Exchange Epic OAuth code for access token
async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: EPIC.clientId,
    client_secret: EPIC.clientSecret,
    redirect_uri: EPIC.redirectUri
  });

  const res = await fetch(EPIC.tokenUrl, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('Token exchange failed: ' + text);
  }

  return res.json();
}

// Get Epic account basic info
async function getAccountInfo(accessToken) {
  const res = await fetch(
    'https://account-public-service-prod.ol.epicgames.com/account/api/public/account',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) return null;
  return res.json();
}

// ---------- Express Routes ----------

// Home
app.get('/', (req, res) => {
  res.send('Skinchecker server running ✔️');
});

// Start Epic login
app.get('/auth/start', (req, res) => {
  const discordId = req.query.discordId;
  if (!discordId) return res.status(400).send('Missing discordId');
  const url = buildEpicAuthUrl(discordId);
  return res.redirect(url);
});

// Epic OAuth callback route
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send('Missing code or state');

  const st = oauthState.get(state);
  if (!st) return res.status(400).send('Invalid state');

  try {
    const tokenData = await exchangeCodeForToken(code);
    userTokens.set(st.discordId, tokenData);
    oauthState.delete(state);

    return res.send(`
      <html>
      <body style="font-family: sans-serif;">
        <h2>Login Successful ✔️</h2>
        <p>You may now close this window.</p>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    return res.status(500).send('Token exchange failed.');
  }
});

// Debug tokens route
app.get('/__tokens/:discordId', (req, res) => {
  if (!process.env.DEBUG_TOKENS) return res.status(403).send('Disabled.');
  res.json({ token: userTokens.get(req.params.discordId) || null });
});

// ---------- Discord Bot ----------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// Load command files from commands/commands/
const commandsPath = path.join(__dirname, 'commands', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const cmd = require(filePath);
  client.commands.set(cmd.data.name, cmd);
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, {
      buildEpicAuthUrl,
      userTokens,
      getAccountInfo
    });
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      interaction.followUp({ content: 'Error executing command.', ephemeral: true });
    } else {
      interaction.reply({ content: 'Error executing command.', ephemeral: true });
    }
  }
});

// Log in bot
client.login(process.env.TOKEN);

// Start Express server
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Express listening on ${port}`));
