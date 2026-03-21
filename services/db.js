import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export default pool;

export async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS participants (
        user_id BIGINT,
        chat_id BIGINT,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        PRIMARY KEY(user_id, chat_id)
      );
    `);
    console.log("✅ Таблица participants готова");
  } catch (err) {
    console.error("❌ Ошибка создания таблицы:", err.message);
  }
}
