import express from "express";
import { bot } from "./utils/telegram.js";
import { initDB } from "./services/db.js";

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("Бот работает"));

app.post("/api/bot", async (req, res) => {
  try {
    await initDB();
    await bot.handleUpdate(req.body);
    res.status(200).send("ok");
  } catch (err) {
    console.error("Ошибка webhook:", err);
    res.status(500).send("Ошибка сервера");
  }
});

// Webhook setup
(async () => {
  const url = `${process.env.APP_URL}/api/bot`;
  await bot.api.deleteWebhook({ drop_pending_updates: true });
  await bot.api.setWebhook(url);
  console.log("✅ Webhook установлен:", url);
})();

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () =>
  console.log("🚀 Сервер запущен на порту", PORT),
);
