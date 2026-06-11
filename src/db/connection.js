const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false  // necessário para o Neon
  }
});

pool.on('connect', () => {
  console.log('✅ Conectado ao banco Neon');
});

pool.on('error', (err) => {
  console.error('❌ Erro no banco de dados:', err);
});

module.exports = pool;