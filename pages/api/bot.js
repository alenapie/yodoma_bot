import { bot } from "../../utils/telegram.js";
import pool, { initDB } from "../../services/db.js";

export default async function handler(req, res) {
  await initDB(); // гарантируем, что таблица есть
  await bot.handleUpdate(req.body);
  res.status(200).send("ok");
}

export const config = { api: { bodyParser: true } };
