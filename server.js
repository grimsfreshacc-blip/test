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
// temporary OAuth state store
const oauthState = new Map();

// ---------- EPIC OAUTH CONFIG ----------
const EPIC = {
  clientId: process.env.EPIC_CLIENT_ID,
  clientSecret: process.env.EPIC_CLIENT_SECRET,
  redirectUri: process.env.EPIC_REDIRECT_URI,
  authUrl: 'https://www.epicgames.com/id/authorize',
  tokenUrl: 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token'
};

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

  if (!res.ok) {
    const err = await res.text();
    throw new Error('Epic OAuth failed: ' + err);
  }

  return res.json();
}

// Placeholder locker request
async function getAccountInfo(accessToken) {
  return { skins: [], pickaxes: [], emotes: [] }; // will upgrade later
}

// -------- EXPRESS ROUTES --------

// Home
app.get('/', (req, res) => {
  res.send('Skinchecker server is running.');
});

// Start OAuth login
app.get('/auth/start', (req, res) => {
  const discordId = req.query.discordId;
  if (!discordId) return res.status(400).send("Missing ?discordId=");

  const url = buildEpicAuthUrl(discordId);
  res.redirect(url);
});

// OAuth callback
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state)
    return res.status(400).send("Missing required parameters.");

  const st = oauthState.get(state);
  if (!st)
    return res.status(400).send("Invalid or expired OAuth state.");

  try {
    const tokenData = await exchangeCodeForToken(code);

    userTokens.set(st.discordId, tokenData);
    oauthState.delete(state);

    return res.send(`
      <html>
        <body style="font-family: Arial; text-align:center; margin-top:50px;">
          <h1>Login Successful!</h1>
          <p>You may now return to Discord.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    return res.status(500).send("OAuth login failed.");
  }
});

// Inspect tokens (DEV ONLY)
app.get('/__debug/tokens/:id', (req, res) => {
  if (!process.env.DEBUG_TOKENS) return res.status(403).send("Disabled");
  res.json(userTokens.get(req.params.id) || {});
});

// ---------- DISCORD BOT ----------
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

// Load /commands
const commandFiles = fs
  .readdirSync(path.join(__dirname, "commands"))
  .filter(f => f.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(path.join(__dirname, "commands", file));
  client.commands.set(command.data.name, command);
}

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Interaction handler
client.on("interactionCreate", async (interaction) => {
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
    await interaction.reply({
      content: "There was an error executing this command.",
      ephemeral: true
    });
  }
});

// LOGIN BOT  (FIXED)
client.login(process.env.DISCORD_BOT_TOKEN);

// Start express server
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Express listening on ${port}`));
