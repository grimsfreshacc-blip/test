require('dotenv').config();

const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { 
  Client, 
  GatewayIntentBits, 
  Collection,
  REST,
  Routes
} = require('discord.js');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------ STORAGE ------------------
const userTokens = new Map();                // discordId -> tokenData
const oauthState = new Map();                // state -> { discordId, created }

// ------------------ EPIC CONFIG ------------------
const EPIC = {
  clientId: process.env.EPIC_CLIENT_ID,
  clientSecret: process.env.EPIC_CLIENT_SECRET,
  redirectUri: process.env.EPIC_REDIRECT_URI,
  authUrl: "https://www.epicgames.com/id/authorize",
  tokenUrl: "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token"
};

// ------------------ BUILD LOGIN URL ------------------
function buildEpicAuthUrl(discordId) {
  const state = `${discordId}:${uuidv4()}`;
  oauthState.set(state, { discordId, created: Date.now() });

  const params = new URLSearchParams({
    client_id: EPIC.clientId,
    response_type: "code",
    redirect_uri: EPIC.redirectUri,
    scope: "basic_profile",
    state
  });

  return `${EPIC.authUrl}?${params.toString()}`;
}

// ------------------ TOKEN EXCHANGE ------------------
async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: EPIC.clientId,
    client_secret: EPIC.clientSecret,
    redirect_uri: EPIC.redirectUri
  });

  const res = await fetch(EPIC.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ------------------ EPIC ACCOUNT FETCH ------------------
async function getAccountInfo(accessToken) {
  const res = await fetch(
    "https://account-public-service-prod.ol.epicgames.com/account/api/public/account",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) return null;
  return res.json();
}

// ------------------ EXPRESS ROUTES ------------------
app.get("/", (req, res) => {
  res.send("Skinchecker server running.");
});

// Start OAuth
app.get("/auth/start", (req, res) => {
  const discordId = req.query.discordId;
  if (!discordId) return res.status(400).send("Missing discordId");
  return res.redirect(buildEpicAuthUrl(discordId));
});

// OAuth Callback
app.get("/auth/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!state || !code) return res.status(400).send("Missing state or code");

  const stateData = oauthState.get(state);
  if (!stateData) return res.status(400).send("Invalid or expired state");

  try {
    const tokenData = await exchangeCodeForToken(code);
    userTokens.set(stateData.discordId, tokenData);
    oauthState.delete(state);

    return res.send(`
      <html>
      <body style="font-family: Arial; text-align:center;">
        <h2>✔ Login Complete</h2>
        <p>You may now close this page and return to Discord.</p>
      </body>
      </html>
    `);
  } catch (err) {
    console.error("OAuth Error:", err);
    return res.status(500).send("OAuth failed.");
  }
});

// ------------------ DISCORD BOT ------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// Load commands from /commands/commands/
const commandsPath = path.join(__dirname, "commands", "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));

for (const file of commandFiles) {
  const cmd = require(path.join(commandsPath, file));
  client.commands.set(cmd.data.name, cmd);
}

// ------------------ AUTO REGISTER SLASH COMMANDS ------------------
async function registerSlashCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  const commands = commandFiles.map(file => {
    const cmd = require(path.join(commandsPath, file));
    return cmd.data.toJSON();
  });

  try {
    console.log("Registering slash commands...");

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("Slash commands registered ✔");
  } catch (err) {
    console.error("Failed to register commands:", err);
  }
}

client.on("ready", async () => {
  console.log(`Bot logged in as ${client.user.tag}`);
  await registerSlashCommands();
});

// Handle /commands
client.on("interactionCreate", async interaction => {
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
    try {
      await interaction.reply({ content: "❌ Error executing command", ephemeral: true });
    } catch {}
  }
});

// ------------------ START EVERYTHING ------------------
client.login(process.env.TOKEN);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Express running on port", port);
});
