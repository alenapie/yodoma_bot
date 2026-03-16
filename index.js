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
// PostgreSQL
// ──────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
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
    console.error("❌ Ошибка создания таблицы:", err.message);
  }
})();

// ──────────────────────────────────────────────
// Express
// ──────────────────────────────────────────────
const app = express();
app.use(express.json());

// ──────────────────────────────────────────────
// Telegram Bot
// ──────────────────────────────────────────────
const bot = new Bot(process.env.TELEGRAM_TOKEN);

// ──────────────────────────────────────────────
// Темы викторины
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

// ──────────────────────────────────────────────
// Генерация викторины
// ──────────────────────────────────────────────
async function generateQuiz(topic = "", model = "gpt-5.2-chat-latest") {
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

  const startTime = Date.now();
  const response = await axios.post(
    "https://api.ai-mediator.ru/v1/chat/completions",
    {
      model: model,
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
      timeout: 60000, // 60 секунд
    },
  );
  const endTime = Date.now();

  console.log(
    `✅ Викторина: модель "${response.data.model}" отработала за ${endTime - startTime}ms`,
  );

  let content = response.data.choices?.[0]?.message?.content?.trim() || "";
  content = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(content);
}

// ──────────────────────────────────────────────
// Энциклопедическое объяснение
// ──────────────────────────────────────────────
async function getWordExplanation(query, model = "gpt-5.2-chat-latest") {
  const systemPrompt = `
Ты — энциклопедический справочник.
Пиши нейтральным стилем, как в Википедии.
Без сленга.
Без повторения термина в начале.
Без кавычек.
1–3 предложения.
Если информации нет — пиши: "Нет достоверной информации".
`;
  const userPrompt = `Дай краткое энциклопедическое объяснение по типу "*слово* - это...": ${query}`;

  const startTime = Date.now();
  const response = await axios.post(
    "https://api.ai-mediator.ru/v1/chat/completions",
    {
      model: model,
      temperature: 0.2,
      max_tokens: 300,
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
      timeout: 60000,
    },
  );
  const endTime = Date.now();

  console.log(
    `✅ Энциклопедия: модель "${response.data.model}" отработала за ${endTime - startTime}ms`,
  );

  let content =
    response.data.choices?.[0]?.message?.content?.trim() ||
    "Нет достоверной информации";
  content = content
    .replace(/^```.*?\n?/g, "")
    .replace(/```$/g, "")
    .trim();
  return content;
}

// ──────────────────────────────────────────────
// Команда /quiz
// ──────────────────────────────────────────────
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
// Обработчик текста
// ──────────────────────────────────────────────
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();

  // Энциклопедия
  const regexExplain =
    /^(едома|ёдома)\s+(что такое|кто такой|кто такая|что это)\s+(.+)/i;
  const matchExplain = text.match(regexExplain);
  if (matchExplain) {
    const query = matchExplain[3].trim();
    try {
      await ctx.replyWithChatAction("typing");
      const explanation = await getWordExplanation(query);
      await ctx.reply(
        explanation.charAt(0).toUpperCase() + explanation.slice(1),
      );
    } catch (err) {
      console.error("Ошибка explain:", err.message);
      await ctx.reply("Не удалось найти информацию 😔");
    }
    return;
  }

  // едома кто
  const regexWho = /^едома кто\s+(.+)/i;
  const matchWho = text.match(regexWho);
  if (matchWho) {
    const query = matchWho[1].trim();
    try {
      await pool.query(
        `INSERT INTO participants(user_id, username, first_name, last_name)
         VALUES($1,$2,$3,$4)
         ON CONFLICT (user_id) DO NOTHING`,
        [
          ctx.message.from.id,
          ctx.message.from.username || null,
          ctx.message.from.first_name || null,
          ctx.message.from.last_name || null,
        ],
      );

      const { rows } = await pool.query(
        "SELECT username, first_name FROM participants ORDER BY RANDOM() LIMIT 1",
      );
      if (rows.length === 0) return await ctx.reply("Нет участников в базе 😔");

      const user = rows[0];
      const display = user.username
        ? `@${user.username}`
        : `${user.first_name || "Неизвестный"}`;
      await ctx.reply(`${query} - ${display}`);
    } catch (err) {
      console.error("Ошибка выбора участника:", err.message);
      await ctx.reply("Не удалось выбрать участника 😔");
    }
    return;
  }

  // Сохраняем пользователя без запроса к AI
  try {
    await pool.query(
      `INSERT INTO participants(user_id, username, first_name, last_name)
       VALUES($1,$2,$3,$4)
       ON CONFLICT (user_id) DO NOTHING`,
      [
        ctx.message.from.id,
        ctx.message.from.username || null,
        ctx.message.from.first_name || null,
        ctx.message.from.last_name || null,
      ],
    );
  } catch (err) {
    console.error("Ошибка добавления участника:", err.message);
  }
});

// ──────────────────────────────────────────────
// Webhook
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
