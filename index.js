require("dotenv").config();
const express = require("express");
const { Bot, webhookCallback } = require("grammy");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// ──────────────────────────────────────────────
// Проверка переменных
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
// JSON-файл для хранения участников
// ──────────────────────────────────────────────
const USERS_FILE = path.join(__dirname, "users.json");
let users = new Map();

try {
  if (fs.existsSync(USERS_FILE)) {
    const data = fs.readFileSync(USERS_FILE, "utf-8");
    const parsed = JSON.parse(data);
    users = new Map(parsed.map((u) => [u.id, u]));
  }
} catch (err) {
  console.error("Ошибка загрузки users.json:", err.message);
}

function saveUsers() {
  try {
    const arr = Array.from(users.values());
    fs.writeFileSync(USERS_FILE, JSON.stringify(arr, null, 2), "utf-8");
  } catch (err) {
    console.error("Ошибка сохранения users.json:", err.message);
  }
}

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

  const systemPrompt = `Ты — генератор викторин.
Отвечай строго одним валидным JSON.
Без текста вне JSON.`;

  const userPrompt = `Создай 1 вопрос средней сложности по теме "${topic}".
Формат:
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
    }
  );

  let content = response.data.choices?.[0]?.message?.content?.trim() || "";
  content = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(content);
}

// ──────────────────────────────────────────────
// /quiz
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
// Сбор участников чата
// ──────────────────────────────────────────────
bot.on("message", (ctx) => {
  const user = ctx.from;
  if (!user) return;

  if (!users.has(user.id)) {
    users.set(user.id, { id: user.id, first_name: user.first_name });
    saveUsers();
  }
});

// ──────────────────────────────────────────────
// Едома/Ёдома обработчик
// ──────────────────────────────────────────────
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();
  const regex =
    /^(едома|ёдома)\s+(что такое|кто такой|кто такая|что это)\s+(.+)/i;
  const match = text.match(regex);
  if (!match) return;

  const query = match[3].trim();

  if (/^кто /.test(match[2])) {
    // Рандомный участник
    const userList = Array.from(users.values());
    if (userList.length === 0) return ctx.reply("Я ещё никого не знаю 😢");

    const randomUser = userList[Math.floor(Math.random() * userList.length)];
    const mention = `<a href="tg://user?id=${randomUser.id}">${randomUser.first_name}</a>`;

    return ctx.reply(`${query} — ${mention}`, { parse_mode: "HTML" });
  }

  // Здесь оставляем текущую энциклопедическую функцию без изменений
  try {
    await ctx.replyWithChatAction("typing");
    const explanation = await getWordExplanation(query);
    await ctx.reply(explanation.charAt(0).toUpperCase() + explanation.slice(1));
  } catch (err) {
    console.error("Ошибка explain:", err.message);
    await ctx.reply("Не удалось найти информацию 😔");
  }
});

// ──────────────────────────────────────────────
// Webhook
// ──────────────────────────────────────────────
app.use(`/bot/${process.env.TELEGRAM_TOKEN}`, webhookCallback(bot, "express"));
app.get("/", (req, res) => res.send("Бот работает"));
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ──────────────────────────────────────────────
// Установка webhook
// ──────────────────────────────────────────────
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
