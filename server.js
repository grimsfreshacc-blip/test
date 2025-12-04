require('dotenv').config();

const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------ In-memory stores ------------------
const userTokens = new Map();       // discordId → tokens
const oauthState = new Map();       // state → discordId + metadata

// ------------------ Epic OAuth Config ------------------
const EPIC = {
  clientId: process.env.EPIC_CLIENT_ID,
  clientSecret: process.env.EPIC_CLIENT_SECRET,
  redirectUri: process.env.EPIC_REDIRECT_URI,
  authUrl: 'https://www.epicgames.com/id/authorize',
  tokenUrl: 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token'
};

// Build login URL
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

// Exchange auth code for tokens
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

  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}

// Placeholder function — replace with correct Epic endpoint later
async function getAccountInfo(accessToken) {
  const res = await fetch(
    'https://account-public-service-prod.ol.epicgames.com/account/api/public/account',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  return res.json();
}

// ------------------ Express Routes ------------------
app.get('/', (_, res) => res.send('Skinchecker server running.'));

// Start Epic OAuth
app.get('/auth/start', (req, res) => {
  const { discordId } = req.query;
  if (!discordId) return res.status(400).send('Missing discordId');
  return res.redirect(buildEpicAuthUrl(discordId));
});

// OAuth callback
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
      <html>
      <body style="font-family: sans-serif;">
        <h2>Login Complete</h2>
        <p>You can now close this window and return to Discord.</p>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('Token exchange failed.');
  }
});

// Debug-only route
app.get('/__tokens/:discordId', (req, res) => {
  if (!process.env.DEBUG_TOKENS) return res.status(403).send('Disabled.');
  res.json({ token: userTokens.get(req.params.discordId) || null });
});

// ------------------ Discord Bot ------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// Create /commands folder if missing
const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) {
  fs.mkdirSync(commandsPath);
  console.log('Created missing /commands folder.');
}

// Load commands safely
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter(f => f.endsWith('.js'));

if (commandFiles.length === 0) {
  console.warn('⚠ No commands found in /commands folder.');
}

for (const file of commandFiles) {
  const cmd = require(path.join(commandsPath, file));
  client.commands.set(cmd.data.name, cmd);
}

client.on('ready', () =>
  console.log(`Discord logged in as ${client.user.tag}`)
);

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
  } catch (err) {
    console.error(err);
    const reply = { content: 'Error executing command.', ephemeral: true };
    interaction.replied || interaction.deferred
      ? interaction.followUp(reply)
      : interaction.reply(reply);
  }
});

client.login(process.env.TOKEN);

// ------------------ Start Express Server ------------------
const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`Express listening on http://localhost:${port}`)
);
