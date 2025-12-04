require('dotenv').config();

const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { Client, GatewayIntentBits, Collection } = require('discord.js');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory stores (simple, non-persistent)
const userTokens = new Map();   // discordId -> token object
const oauthState = new Map();   // state -> { discordId, returnTo, created }

// ---------- Epic/OAuth config ----------
const EPIC = {
  clientId: process.env.EPIC_CLIENT_ID,
  clientSecret: process.env.EPIC_CLIENT_SECRET,
  redirectUri: process.env.EPIC_REDIRECT_URI || `${process.env.APP_URL}/auth/callback`,
  authUrl: 'https://www.epicgames.com/id/authorize',
  tokenUrl: 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token'
};

if (!EPIC.clientId || !EPIC.clientSecret || !EPIC.redirectUri) {
  console.warn('⚠️ Missing EPIC_CLIENT_ID / EPIC_CLIENT_SECRET / EPIC_REDIRECT_URI in env.');
}

// Builds epic auth url, stores a short-lived state referencing the discord user
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

// Placeholder: fetch Epic account info (you may need to update to accurate endpoints)
async function getAccountInfo(accessToken) {
  // NOTE: Epic account endpoints are picky. This is a placeholder.
  const res = await fetch('https://account-public-service-prod.ol.epicgames.com/account/api/public/account', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return null;
  return res.json();
}

// ---------- Express routes ----------
app.get('/', (req, res) => res.send('Skinchecker server running.'));

app.get('/auth/start', (req, res) => {
  const discordId = req.query.discordId;
  if (!discordId) return res.status(400).send('Missing discordId query param.');
  const url = buildEpicAuthUrl(discordId);
  return res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send('Missing code or state.');

  const st = oauthState.get(state);
  if (!st) return res.status(400).send('Invalid or expired state.');

  try {
    const tokenData = await exchangeCodeForToken(code);
    userTokens.set(st.discordId, tokenData);
    oauthState.delete(state);
    return res.send(`
      <html><body style="font-family:sans-serif;">
        <h2>Login complete</h2>
        <p>Return to Discord — your account is linked.</p>
      </body></html>`);
  } catch (err) {
    console.error(err);
    return res.status(500).send('Token exchange failed.');
  }
});

// dev-only inspect tokens
app.get('/__tokens/:discordId', (req, res) => {
  if (!process.env.DEBUG_TOKENS) return res.status(403).send('Disabled.');
  const t = userTokens.get(req.params.discordId) || null;
  res.json({ token: t });
});

// ---------- Discord bot part ----------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// load commands from ./commands (expects each command to export .data and .execute)
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const cmd = require(path.join(commandsPath, file));
    if (cmd && cmd.data && cmd.execute) client.commands.set(cmd.data.name, cmd);
  }
}

client.once('ready', () => {
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

client.login(process.env.TOKEN).catch(err => {
  console.error('Failed to login Discord client:', err);
});

// start server on Render's port
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Express listening on ${port}`));
