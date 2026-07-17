const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/connection');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 10;

// ─── GET /api/users/funcionarias — lista todas ────────────────
router.get('/funcionarias', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nome, telefone, dia_folga FROM users WHERE role = 'funcionaria' ORDER BY nome`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar funcionárias:', error);
    res.status(500).json({ message: 'Erro ao buscar funcionárias' });
  }
});

// ─── POST /api/users/funcionarias — cria nova ─────────────────
router.post('/funcionarias', requireAdmin, async (req, res) => {
  const { nome, telefone, senha, dia_folga } = req.body;

  if (!nome || !telefone || !senha) {
    return res.status(400).json({ message: 'Nome, telefone e senha são obrigatórios' });
  }
  if (senha.length < 6) {
    return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres' });
  }
  if (dia_folga !== undefined && dia_folga !== null && (dia_folga < 0 || dia_folga > 6)) {
    return res.status(400).json({ message: 'Dia de folga inválido' });
  }

  try {
    const existe = await pool.query('SELECT id FROM users WHERE telefone = $1', [telefone.trim()]);
    if (existe.rows.length > 0) {
      return res.status(409).json({ message: 'Telefone já cadastrado' });
    }

    const senha_hash = await bcrypt.hash(senha, SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO users (nome, telefone, senha_hash, role, dia_folga)
       VALUES ($1, $2, $3, 'funcionaria', $4)
       RETURNING id, nome, telefone, role, dia_folga`,
      [nome.trim(), telefone.trim(), senha_hash, dia_folga ?? null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao criar funcionária:', error);
    res.status(500).json({ message: 'Erro ao criar funcionária' });
  }
});

// ─── PUT /api/users/funcionarias/:id — edita ──────────────────
router.put('/funcionarias/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { nome, telefone, senha, dia_folga } = req.body;

  if (dia_folga !== undefined && dia_folga !== null && (dia_folga < 0 || dia_folga > 6)) {
    return res.status(400).json({ message: 'Dia de folga inválido' });
  }

  try {
    const atual = await pool.query(
      `SELECT * FROM users WHERE id = $1 AND role = 'funcionaria'`,
      [id]
    );
    if (atual.rows.length === 0) {
      return res.status(404).json({ message: 'Funcionária não encontrada' });
    }
    const u = atual.rows[0];

    if (telefone && telefone.trim() !== u.telefone) {
      const existe = await pool.query(
        'SELECT id FROM users WHERE telefone = $1 AND id != $2',
        [telefone.trim(), id]
      );
      if (existe.rows.length > 0) {
        return res.status(409).json({ message: 'Telefone já cadastrado' });
      }
    }

    let senha_hash = u.senha_hash;
    if (senha) {
      if (senha.length < 6) {
        return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres' });
      }
      senha_hash = await bcrypt.hash(senha, SALT_ROUNDS);
    }

    const result = await pool.query(
      `UPDATE users
       SET nome = $1, telefone = $2, senha_hash = $3, dia_folga = $4
       WHERE id = $5
       RETURNING id, nome, telefone, role, dia_folga`,
      [
        nome?.trim() ?? u.nome,
        telefone?.trim() ?? u.telefone,
        senha_hash,
        dia_folga !== undefined ? dia_folga : u.dia_folga,
        id
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao editar funcionária:', error);
    res.status(500).json({ message: 'Erro ao editar funcionária' });
  }
});

// ─── DELETE /api/users/funcionarias/:id — exclui ──────────────
router.delete('/funcionarias/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM users WHERE id = $1 AND role = 'funcionaria' RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Funcionária não encontrada' });
    }
    res.json({ message: 'Funcionária excluída com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir funcionária:', error);
    if (error.code === '23503') {
      return res.status(409).json({ message: 'Essa funcionária tem agendamentos vinculados e não pode ser excluída' });
    }
    res.status(500).json({ message: 'Erro ao excluir funcionária' });
  }
});

module.exports = router;