const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const servicosRoutes = require('./routes/servicos');
const agendamentosRoutes = require('./routes/agendamentos');
const { authenticateToken } = require('./middleware/auth');

const app = express();

// ─── Middlewares ─────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ─── Rotas públicas ──────────────────────────────────────────
app.use('/api/auth', authRoutes);

// ─── Rotas protegidas ────────────────────────────────────────
app.use('/api/servicos', authenticateToken, servicosRoutes);
app.use('/api/agendamentos', authenticateToken, agendamentosRoutes);

// ─── Health check ────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor rodando!' });
});

// ─── Start ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});