import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initDB() {
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
}

export default pool;
