const express = require('express');
const pool = require('../db/connection');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/servicos — lista todos os ativos ────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, descricao, preco, duracao FROM services WHERE ativo = TRUE ORDER BY nome'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar serviços:', error);
    res.status(500).json({ message: 'Erro ao buscar serviços' });
  }
});

// ─── POST /api/servicos — admin cria serviço ─────────────────
router.post('/', requireAdmin, async (req, res) => {
  const { nome, descricao, preco, duracao } = req.body;

  if (!nome || !preco) {
    return res.status(400).json({ message: 'Nome e preço são obrigatórios' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO services (nome, descricao, preco, duracao)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [nome, descricao || null, preco, duracao || 60]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao criar serviço:', error);
    res.status(500).json({ message: 'Erro ao criar serviço' });
  }
});

// ─── PUT /api/servicos/:id — admin edita serviço ─────────────
router.put('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { nome, descricao, preco, duracao, ativo } = req.body;

  try {
    const result = await pool.query(
      `UPDATE services
       SET nome = COALESCE($1, nome),
           descricao = COALESCE($2, descricao),
           preco = COALESCE($3, preco),
           duracao = COALESCE($4, duracao),
           ativo = COALESCE($5, ativo)
       WHERE id = $6
       RETURNING *`,
      [nome, descricao, preco, duracao, ativo, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao editar serviço:', error);
    res.status(500).json({ message: 'Erro ao editar serviço' });
  }
});

// ─── DELETE /api/servicos/:id — admin exclui serviço ───────
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM services WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }
    res.json({ message: 'Serviço excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir serviço:', error);
    res.status(500).json({ message: 'Erro ao excluir serviço' });
  }
});

module.exports = router;