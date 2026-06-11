const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 10;

// ─── POST /api/auth/register ─────────────────────────────────
router.post('/register', async (req, res) => {
  const { nome, telefone, senha, role } = req.body;

  if (!nome || !telefone || !senha) {
    return res.status(400).json({ message: 'Telefone e senha são obrigatórios' });
  }

  if (senha.length < 6) {
    return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres' });
  }

  try {
    // Verifica se telefone já existe
    const existe = await pool.query(
      'SELECT id FROM usuarios WHERE telefone = $1',
      [telefone.trim()]
    );
    if (existe.rows.length > 0) {
      return res.status(409).json({ message: 'Telefone já cadastrado' });
    }

    const senha_hash = await bcrypt.hash(senha, SALT_ROUNDS);

    // Só permite role 'admin' se vier de um token admin (segurança extra)
    const userRole = 'cliente'; // Cadastro público sempre cria cliente

    const result = await pool.query(
      `INSERT INTO usuarios (nome, telefone, senha_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nome, telefone, role`,
      [nome.trim(), telefone.trim(), senha_hash, userRole]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, nome: user.nome, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user });
  } catch (error) {
    console.error('Erro no register:', error);
    res.status(500).json({ message: 'Erro interno no servidor' });
  }
});


// ─── POST /api/auth/login ─────────────────────────────────────
router.post('/login', async (req, res) => {
  const { telefone, senha } = req.body;

  if (!telefone || !senha) {
    return res.status(400).json({ message: 'Telefone e senha são obrigatórios' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE telefone = $1',
      [telefone.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Telefone ou senha incorretos' });
    }

    const user = result.rows[0];
    const senhaCorreta = await bcrypt.compare(senha, user.senha_hash);

    if (!senhaCorreta) {
      return res.status(401).json({ message: 'Telefone ou senha incorretos' });
    }

    const token = jwt.sign(
      { id: user.id, nome: user.nome, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        nome: user.nome,
        telefone: user.telefone,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ message: 'Erro interno no servidor' });
  }
});


// ─── GET /api/auth/verify ─────────────────────────────────────
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, telefone, role FROM usuarios WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Erro no verify:', error);
    res.status(500).json({ message: 'Erro interno no servidor' });
  }
});

module.exports = router;