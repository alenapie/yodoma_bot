import { bot, setupBot } from "../../utils/telegram.js";
import { initDB } from "../../services/db.js";

setupBot();

export default async function handler(req, res) {
  try {
    await initDB();
    await bot.handleUpdate(req.body);
    res.status(200).send("ok");
  } catch (err) {
    console.error("Ошибка webhook:", err);
    res.status(500).send("Internal Server Error");
  }
}

export const config = { api: { bodyParser: true } };
