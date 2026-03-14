require("dotenv").config();
const express = require("express");
const { Bot, webhookCallback } = require("grammy");
const axios = require("axios");
const Database = require("better-sqlite3");

// ──────────────────────────────────────────────
// Проверка переменных окружения
// ──────────────────────────────────────────────
if (
  !process.env.TELEGRAM_TOKEN ||
  !process.env.AI_MEDIATOR_API_KEY ||
  !process.env.APP_URL
) {
  console.error("❌ Отсутствуют переменные окружения!");
  process.exit(1);
}

// ──────────────────────────────────────────────
// Инициализация бота и базы данных
// ──────────────────────────────────────────────
const app = express();
app.use(express.json());
const bot = new Bot(process.env.TELEGRAM_TOKEN);

// SQLite
const db = new Database("participants.db");
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS participants (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_name TEXT
  )
`,
).run();

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
async function generateQuiz(topic = "") {
  if (!topic.trim()) {
    topic = allowedTopics[Math.floor(Math.random() * allowedTopics.length)];
  }

  const systemPrompt = `
Ты — генератор викторин.
Отвечай строго одним валидным JSON.
Без текста вне JSON.
`;

  const userPrompt = `
Создай 1 вопрос средней сложности по теме "${topic}".
Формат:
{
  "question": "...",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correctIndex": 0-3,
  "explanation": "..."
}
`;

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

// ──────────────────────────────────────────────
// Энциклопедическое объяснение
// ──────────────────────────────────────────────
async function getWordExplanation(query) {
  const systemPrompt = `
Ты — энциклопедический справочник.
Пиши нейтральным стилем, как в Википедии.
Без сленга.
Без повторения термина в начале.
Без кавычек.
1–3 предложения.
Если информации нет — пиши: "Нет достоверной информации".
`;

  const userPrompt = `Дай краткое энциклопедическое объяснение по типу "*слово* - это...":\n${query}`;

  const response = await axios.post(
    "https://api.ai-mediator.ru/v1/chat/completions",
    {
      model: "gpt-4o-mini",
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
    },
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
// Сохраняем участников в базу
// ──────────────────────────────────────────────
bot.on("message", (ctx) => {
  const user = ctx.from;
  if (user && !user.is_bot) {
    db.prepare(
      `
      INSERT OR REPLACE INTO participants (user_id, username, first_name, last_name)
      VALUES (?, ?, ?, ?)
    `,
    ).run(
      user.id,
      user.username || null,
      user.first_name || null,
      user.last_name || null,
    );
  }
});

// ──────────────────────────────────────────────
// Обработчик текста
// ──────────────────────────────────────────────
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();

  // 1️⃣ Энциклопедические объяснения
  const regexEdomaExplain =
    /^(едома|ёдома)\s+(что такое|кто такой|кто такая|что это)\s+(.+)/i;
  const matchExplain = text.match(regexEdomaExplain);
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

  // 2️⃣ Едома кто ХХХ — случайный участник из базы
  const regexEdomaWho = /^едома\s+кто\s+(.+)\?$/i;
  const matchWho = text.match(regexEdomaWho);
  if (matchWho) {
    const queryName = matchWho[1].trim();
    try {
      await ctx.replyWithChatAction("typing");

      const row = db
        .prepare(`SELECT * FROM participants ORDER BY RANDOM() LIMIT 1`)
        .get();

      if (!row) {
        await ctx.reply("Нет участников для выбора 😔");
        return;
      }

      await ctx.reply(`${queryName} - @${row.username || row.first_name}`);
    } catch (err) {
      console.error("Ошибка кто:", err);
      await ctx.reply("Не удалось выбрать участника 😔");
    }
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
  console.log("Webhook установлен:", url);
}

setupWebhook();

// ──────────────────────────────────────────────
// Запуск сервера
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Сервер запущен на порту", PORT);
});
