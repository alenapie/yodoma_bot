function capitalizeFirstLetter(text) {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Добавляй сюда новые общие функции по мере развития проекта.
module.exports = {
  capitalizeFirstLetter,
};
