const express = require('express');
const pool = require('../db/connection');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/agendamentos — admin vê todos ──────────────────
router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.id,
        a.data_hora,
        a.status,
        a.observacoes,
        a.criado_em,
        u.nome  AS cliente_nome,
        u.telefone AS cliente_telefone,
        s.nome  AS servico,
        s.preco AS servico_preco,
        s.id    AS servico_id
      FROM agendamentos a
      JOIN users u ON u.id = a.usuario_id
      JOIN services  s ON s.id = a.servico_id
      ORDER BY a.data_hora DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar agendamentos:', error);
    res.status(500).json({ message: 'Erro ao listar agendamentos' });
  }
});

// ─── GET /api/agendamentos/meus — cliente vê os próprios ─────
router.get('/meus', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.id,
        a.data_hora,
        a.status,
        a.observacoes,
        a.criado_em,
        s.nome  AS servico,
        s.preco AS servico_preco,
        s.id    AS servico_id
      FROM agendamentos a
      JOIN services s ON s.id = a.servico_id
      WHERE a.usuario_id = $1
      ORDER BY a.data_hora DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar meus agendamentos:', error);
    res.status(500).json({ message: 'Erro ao buscar agendamentos' });
  }
});

// ─── POST /api/agendamentos — cliente cria agendamento ───────
router.post('/', async (req, res) => {
  const { servico_id, data_hora, observacoes } = req.body;

  if (!servico_id || !data_hora) {
    return res.status(400).json({ message: 'Serviço e data/hora são obrigatórios' });
  }

  // Não permite agendar no passado
  if (new Date(data_hora) < new Date()) {
    return res.status(400).json({ message: 'Não é possível agendar para uma data no passado' });
  }

  try {
    // Verifica se já existe agendamento neste horário
    const conflito = await pool.query(`
      SELECT id FROM agendamentos
      WHERE data_hora = $1 AND status != 'cancelado'
    `, [data_hora]);

    if (conflito.rows.length > 0) {
      return res.status(409).json({ message: 'Horário já reservado. Escolha outro horário.' });
    }

    const result = await pool.query(`
      INSERT INTO agendamentos (usuario_id, servico_id, data_hora, observacoes)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [req.user.id, servico_id, data_hora, observacoes || null]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao criar agendamento:', error);
    res.status(500).json({ message: 'Erro ao criar agendamento' });
  }
});

// ─── PUT /api/agendamentos/:id — atualiza status ─────────────
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const statusValidos = ['pendente', 'confirmado', 'cancelado'];
  if (!statusValidos.includes(status)) {
    return res.status(400).json({ message: 'Status inválido' });
  }

  try {
    // Cliente só pode cancelar os próprios agendamentos
    // Admin pode alterar qualquer um
    let query, params;

    if (req.user.role === 'admin') {
      query = `UPDATE agendamentos SET status = $1 WHERE id = $2 RETURNING *`;
      params = [status, id];
    } else {
      // Cliente só pode cancelar
      if (status !== 'cancelado') {
        return res.status(403).json({ message: 'Clientes só podem cancelar agendamentos' });
      }
      query = `UPDATE agendamentos SET status = $1 WHERE id = $2 AND usuario_id = $3 RETURNING *`;
      params = [status, id, req.user.id];
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agendamento não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar agendamento:', error);
    res.status(500).json({ message: 'Erro ao atualizar agendamento' });
  }
});

module.exports = router;