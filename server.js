require("dotenv").config();

const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { Client, GatewayIntentBits, Collection } = require("discord.js");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------
// In-memory storage
// ---------------------------------------------------------
const userTokens = new Map();  // { discordId -> tokenData }
const oauthState = new Map();  // { state -> { discordId, created } }

// ---------------------------------------------------------
// Epic OAuth configuration
// ---------------------------------------------------------
const EPIC = {
  clientId: process.env.EPIC_CLIENT_ID,
  clientSecret: process.env.EPIC_CLIENT_SECRET,
  redirectUri:
    process.env.EPIC_REDIRECT_URI ||
    `${process.env.APP_URL}/auth/callback`,

  authUrl: "https://www.epicgames.com/id/authorize",
  tokenUrl:
    "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token",
};

if (!EPIC.clientId || !EPIC.clientSecret || !EPIC.redirectUri) {
  console.warn(
    "⚠️ Missing EPIC_CLIENT_ID / EPIC_CLIENT_SECRET / EPIC_REDIRECT_URI in environment."
  );
}

// ---------------------------------------------------------
// Build OAuth login URL
// ---------------------------------------------------------
function buildEpicAuthUrl(discordId) {
  const state = `${discordId}:${uuidv4()}`;

  oauthState.set(state, {
    discordId,
    created: Date.now(),
  });

  const params = new URLSearchParams({
    client_id: EPIC.clientId,
    response_type: "code",
    scope: "basic_profile",
    redirect_uri: EPIC.redirectUri,
    state,
  });

  return `${EPIC.authUrl}?${params.toString()}`;
}

// ---------------------------------------------------------
// Exchange OAuth code for token
// ---------------------------------------------------------
async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: EPIC.clientId,
    client_secret: EPIC.clientSecret,
    redirect_uri: EPIC.redirectUri,
  });

  const res = await fetch(EPIC.tokenUrl, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!res.ok) {
    throw new Error("Token exchange failed: " + (await res.text()));
  }

  return res.json();
}

// ---------------------------------------------------------
// Get Epic account info
// ---------------------------------------------------------
async function getAccountInfo(accessToken) {
  const res = await fetch(
    "https://account-public-service-prod.ol.epicgames.com/account/api/public/account",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) return null;
  return res.json();
}

// ---------------------------------------------------------
// Express Routes
// ---------------------------------------------------------
app.get("/", (req, res) => {
  res.send("Skinchecker server running.");
});

// ⭐ BotGhost Login API Route (NEW)
app.get("/login", (req, res) => {
  const discordId = req.query.discordId;

  if (!discordId) {
    return res.status(400).json({ error: "Missing discordId" });
  }

  const url = buildEpicAuthUrl(discordId);

  // Response BotGhost expects
  return res.json({
    url: url
  });
});

// Start OAuth
app.get("/auth/start", (req, res) => {
  const discordId = req.query.discordId;
  if (!discordId) return res.status(400).send("Missing discordId.");

  const url = buildEpicAuthUrl(discordId);
  res.redirect(url);
});

// OAuth Callback
app.get("/auth/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) return res.status(400).send("Missing data.");

  const data = oauthState.get(state);
  if (!data) return res.status(400).send("Invalid or expired state.");

  try {
    const tokenData = await exchangeCodeForToken(code);

    userTokens.set(data.discordId, tokenData);
    oauthState.delete(state);

    return res.send(`
      <html>
      <body style="font-family: sans-serif;">
        <h2>Epic Login Complete ✔️</h2>
        <p>You may now return to Discord.</p>
      </body>
      </html>
    `);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Token exchange failed.");
  }
});

// DEV: view a user’s stored tokens
app.get("/debug/tokens/:id", (req, res) => {
  if (!process.env.DEBUG_TOKENS) return res.status(403).send("Disabled.");
  res.json(userTokens.get(req.params.id) || {});
});

// ---------------------------------------------------------
// Discord Bot Setup
// ---------------------------------------------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();

// Load commands from ./commands
const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
  const files = fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"));

  for (const file of files) {
    const command = require(path.join(commandsPath, file));
    if (command?.data && command?.execute) {
      client.commands.set(command.data.name, command);
    }
  }
}

// Bot ready
client.once("ready", () => {
  console.log(`Discord logged in as ${client.user.tag}`);
});

// Command handler
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;

  try {
    await cmd.execute(interaction, {
      buildEpicAuthUrl,
      userTokens,
      getAccountInfo,
    });
  } catch (e) {
    console.error(e);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "❌ Error while running command.",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "❌ Error while running command.",
        ephemeral: true,
      });
    }
  }
});

// Login bot
client.login(process.env.TOKEN).catch((err) => {
  console.error("Discord login failed:", err);
});

// Listen on Render port
const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`Express server listening on port ${port}`)
);
