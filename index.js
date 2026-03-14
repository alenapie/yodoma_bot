require("dotenv").config();
const express = require("express");
const { Bot, webhookCallback } = require("grammy");
const { registerBotHandlers } = require("./handlers/registerBotHandlers");

if (
  !process.env.TELEGRAM_TOKEN ||
  !process.env.AI_MEDIATOR_API_KEY ||
  !process.env.APP_URL
) {
  console.error("❌ Отсутствуют переменные окружения!");
  process.exit(1);
}

const app = express();
app.use(express.json());

const bot = new Bot(process.env.TELEGRAM_TOKEN);
registerBotHandlers(bot);

app.use(`/bot/${process.env.TELEGRAM_TOKEN}`, webhookCallback(bot, "express"));

app.get("/", (req, res) => res.send("Бот работает"));
app.get("/health", (req, res) => res.json({ status: "ok" }));

async function setupWebhook() {
  await bot.api.deleteWebhook({ drop_pending_updates: true });
  const url = `${process.env.APP_URL}/bot/${process.env.TELEGRAM_TOKEN}`;
  await bot.api.setWebhook(url);
  console.log("Webhook установлен:", url);
}

setupWebhook();
