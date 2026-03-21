import { bot, setupBot } from "../../utils/telegram.js";
import pool, { initDB } from "../../services/db.js";

setupBot();

export default async function handler(req, res) {
  await initDB();
  await bot.handleUpdate(req.body);
  res.status(200).json({ ok: true });
}

export const config = { api: { bodyParser: true } };
