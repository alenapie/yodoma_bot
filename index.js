require("dotenv").config();
const express = require("express");
const { Bot, webhookCallback } = require("grammy");
const axios = require("axios");
const { Pool } = require("pg");

// ──────────────────────────────────────────────
// Проверка переменных
// ──────────────────────────────────────────────
if (
  !process.env.TELEGRAM_TOKEN ||
  !process.env.AI_MEDIATOR_API_KEY ||
  !process.env.APP_URL ||
  !process.env.DATABASE_URL
) {
  console.error("❌ Отсутствуют переменные окружения!");
  process.exit(1);
}

// ──────────────────────────────────────────────
// PostgreSQL Pool
// ──────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    // Создание таблицы participants, если нет
    await pool.query(`
      CREATE TABLE IF NOT EXISTS participants (
        user_id BIGINT PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        last_name TEXT
      );
    `);
    console.log("✅ Таблица participants готова");
  } catch (err) {
    console.error("❌ Ошибка при создании таблицы:", err.message);
  }
})();

// ──────────────────────────────────────────────
// Express
// ──────────────────────────────────────────────
const app = express();
app.use(express.json());

// ──────────────────────────────────────────────
// Инициализация бота
// ──────────────────────────────────────────────
const bot = new Bot(process.env.TELEGRAM_TOKEN);

// ──────────────────────────────────────────────
// Викторина
// ──────────────────────────────────────────────
const allowedTopics = [
  "история",
  "география",
  "страны",
  "столицы",
  "животные",
  "еда",
  "спорт",
  "музыка",
  "кино",
  "литература",
  "искусство",
  "знаменитости",
  "путешествия",
  "традиции",
  "праздники",
];

async function generateQuiz(topic = "") {
  if (!topic.trim())
    topic = allowedTopics[Math.floor(Math.random() * allowedTopics.length)];

  const systemPrompt = `Ты — генератор викторин. Отвечай строго JSON.`;
  const userPrompt = `Создай 1 вопрос средней сложности по теме "${topic}". Формат:
{
  "question": "...",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correctIndex": 0-3,
  "explanation": "..."
}`;

  const response = await axios.post(
    "https://api.ai-mediator.ru/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 600,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AI_MEDIATOR_API_KEY}`,
      },
    },
  );

  let content = response.data.choices?.[0]?.message?.content?.trim() || "";
  content = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(content);
}

bot.command("quiz", async (ctx) => {
  const topic = ctx.message.text.slice("/quiz".length).trim();
  try {
    const loading = await ctx.reply("Генерирую вопрос... ⏳");
    const quiz = await generateQuiz(topic);

    await ctx.replyWithPoll(quiz.question, quiz.options, {
      type: "quiz",
      correct_option_id: quiz.correctIndex,
      explanation: quiz.explanation,
      is_anonymous: false,
    });

    await ctx.api
      .deleteMessage(ctx.chat.id, loading.message_id)
      .catch(() => {});
  } catch (err) {
    console.error("Ошибка /quiz:", err.message);
    await ctx.reply("Не удалось создать вопрос 😔");
  }
});

// ──────────────────────────────────────────────
// "едома кто ххх"
// ──────────────────────────────────────────────
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();
  const regex = /^едома кто\s+(.+)/i;
  const match = text.match(regex);

  // Если сообщение не по формату, только сохраняем участника
  try {
    const user = ctx.message.from;
    await pool.query(
      `INSERT INTO participants(user_id, username, first_name, last_name)
       VALUES($1,$2,$3,$4)
       ON CONFLICT (user_id) DO NOTHING`,
      [
        user.id,
        user.username || null,
        user.first_name || null,
        user.last_name || null,
      ],
    );

    // Логируем количество участников
    const { rows } = await pool.query("SELECT COUNT(*) FROM participants");
    console.log("📊 Всего участников в базе:", rows[0].count);
  } catch (err) {
    console.error("Ошибка добавления участника:", err.message);
  }

  // Если это запрос "едома кто ххх"
  if (!match) return;
  const query = match[1].trim();

  try {
    const { rows } = await pool.query(
      "SELECT username, first_name FROM participants ORDER BY RANDOM() LIMIT 1",
    );
    if (rows.length === 0) {
      await ctx.reply("Нет участников в базе 😔");
      return;
    }
    const randomUser = rows[0];
    const display = randomUser.username
      ? `@${randomUser.username}`
      : `${randomUser.first_name || "Неизвестный"}`;
    await ctx.reply(`${query} - ${display}`);
  } catch (err) {
    console.error("Ошибка выборки случайного участника:", err.message);
    await ctx.reply("Не удалось выбрать участника 😔");
  }
});

// ──────────────────────────────────────────────
// Webhook для Render
// ──────────────────────────────────────────────
app.use(`/bot/${process.env.TELEGRAM_TOKEN}`, webhookCallback(bot, "express"));
app.get("/", (req, res) => res.send("Бот работает"));
app.get("/health", (req, res) => res.json({ status: "ok" }));

async function setupWebhook() {
  await bot.api.deleteWebhook({ drop_pending_updates: true });
  const url = `${process.env.APP_URL}/bot/${process.env.TELEGRAM_TOKEN}`;
  await bot.api.setWebhook(url);
  console.log("✅ Webhook установлен:", url);
}

setupWebhook();

// ──────────────────────────────────────────────
// Запуск сервера
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () =>
  console.log("🚀 Сервер запущен на порту", PORT),
);
