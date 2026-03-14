const { registerQuizHandler } = require("./registerQuizHandler");
const { registerYodomaHandler } = require("./registerYodomaHandler");

function registerBotHandlers(bot) {
  registerQuizHandler(bot);
  registerYodomaHandler(bot);
}

module.exports = {
  registerBotHandlers,
};
