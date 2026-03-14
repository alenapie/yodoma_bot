const { getWordExplanation } = require("../services/aiService");
const { capitalizeFirstLetter } = require("../utils/customFunctions");

function registerYodomaHandler(bot) {
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    const regex = /^(едома|ёдома)\s+(что такое|кто такой|кто такая|что это)\s+(.+)/i;

    const match = text.match(regex);
    if (!match) return;

    const query = match[3].trim();

    try {
      await ctx.replyWithChatAction("typing");
      const explanation = await getWordExplanation(query);
      await ctx.reply(capitalizeFirstLetter(explanation));
    } catch (err) {
      console.error("Ошибка explain:", err.message);
      await ctx.reply("Не удалось найти информацию 😔");
    }
  });
}

module.exports = {
  registerYodomaHandler,
};
