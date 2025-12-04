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

// In-memory store: discordId -> token object
const userTokens = new Map();
// temporary state store for OAuth: state -> discordId
const oauthState = new Map();

// ---------- Epic OAuth helpers ----------
const EPIC = {
  clientId: process.env.EPIC_CLIENT_ID,
  clientSecret: process.env.EPIC_CLIENT_SECRET,
  redirectUri: process.env.EPIC_REDIRECT_URI,
  authUrl: 'https://www.epicgames.com/id/authorize',
  tokenUrl: 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token'
};

// build auth url with state containing discordId
function buildEpicAuthUrl(discordId, returnTo = '/') {
  const state = `${discordId}:${uuidv4()}`;
  oauthState.set(state, { discordId, returnTo, created: Date.now() });
  const params = new URLSearchParams({
    client_id: EPIC.clientId,
    response_type: 'code',
    scope: 'basic_profile', // adjust scopes if needed
    redirect_uri: EPIC.redirectUri,
    state
  });
  return `${EPIC.authUrl}?${params.toString()}`;
}

// exchange code for tokens (client_credentials + auth code flow)
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

// Example fetch for account info (placeholder - Epic endpoints vary)
async function getAccountInfo(accessToken) {
  // This is a placeholder call — replace with correct Epic API calls to get locker/entitlements
  const res = await fetch('https://account-public-service-prod.ol.epicgames.com/account/api/public/account', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return null;
  return res.json();
}

// ---------- Express routes ----------

// Simple home
app.get('/', (req, res) => {
  res.send('Skinchecker server running.');
});

// Route used by the bot button - starts OAuth flow
// Expect ?discordId=XYZ OR from bot we embed link with state generation
app.get('/auth/start', (req, res) => {
  const discordId = req.query.discordId;
  if (!discordId) return res.status(400).send('Missing discordId query param.');
  const url = buildEpicAuthUrl(discordId);
  return res.redirect(url);
});

// OAuth callback from Epic
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send('Missing code or state.');

  const st = oauthState.get(state);
  if (!st) return res.status(400).send('Invalid or expired state.');

  try {
    const tokenData = await exchangeCodeForToken(code);
    // store tokenData for the Discord user
    userTokens.set(st.discordId, tokenData);
    oauthState.delete(state);
    return res.send(`
      <html>
        <body style="font-family:sans-serif;">
          <h2>Login complete</h2>
          <p>You can now close this window and return to Discord.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    return res.status(500).send('Token exchange failed.');
  }
});

// Endpoint to inspect token (dev only)
app.get('/__tokens/:discordId', (req, res) => {
  const { discordId } = req.params;
  if (!process.env.DEBUG_TOKENS) return res.status(403).send('Disabled.');
  const t = userTokens.get(discordId) || null;
  res.json({ token: t });
});

// ---------- Discord bot portion ----------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// load commands folder
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const cmd = require(path.join(__dirname, 'commands', file));
  client.commands.set(cmd.data.name, cmd);
}

client.on('ready', () => {
  console.log(`Discord logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction, { buildEpicAuthUrl, userTokens, getAccountInfo });
  } catch (err) {
    console.error(err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Error executing command.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Error executing command.', ephemeral: true });
    }
  }
});

client.login(process.env.TOKEN);

// start express server
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Express listening on ${port}`));
