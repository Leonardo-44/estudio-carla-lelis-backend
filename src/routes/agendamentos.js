const express = require('express');
const pool = require('../db/connection');
const { requireAdmin, requireStaff } = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/agendamentos/horarios-ocupados ─────────────────
// ANTES das rotas com :id
router.get('/horarios-ocupados', async (req, res) => {
  const { data } = req.query;

  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return res.status(400).json({ message: 'Parâmetro "data" inválido. Use o formato YYYY-MM-DD.' });
  }

  try {
    const result = await pool.query(`
      SELECT TO_CHAR(data_hora AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS hora
      FROM agendamentos
      WHERE data_hora::date = $1::date
        AND status != 'cancelado'
      ORDER BY hora
    `, [data]);

    const horas = result.rows.map(r => r.hora);
    res.json(horas);
  } catch (error) {
    console.error('Erro ao buscar horários ocupados:', error);
    res.status(500).json({ message: 'Erro ao buscar horários ocupados.' });
  }
});

// ─── GET /api/agendamentos/hoje — funcionária/admin vê o dia ─
router.get('/hoje', requireStaff, async (req, res) => {
  try {
    let query, params;

    if (req.user.role === 'admin') {
      query = `
        SELECT
          a.id, a.data_hora, a.status, a.observacoes,
          u.nome AS cliente_nome, u.telefone AS cliente_telefone,
          s.nome AS servico,
          f.nome AS funcionaria_nome
        FROM agendamentos a
        JOIN users u ON u.id = a.usuario_id
        JOIN services s ON s.id = a.servico_id
        LEFT JOIN users f ON f.id = a.funcionaria_id
        WHERE a.data_hora::date = CURRENT_DATE
          AND a.status != 'cancelado'
        ORDER BY a.data_hora ASC
      `;
      params = [];
    } else {
      // funcionária só vê os próprios clientes do dia
      query = `
        SELECT
          a.id, a.data_hora, a.status, a.observacoes,
          u.nome AS cliente_nome, u.telefone AS cliente_telefone,
          s.nome AS servico
        FROM agendamentos a
        JOIN users u ON u.id = a.usuario_id
        JOIN services s ON s.id = a.servico_id
        WHERE a.data_hora::date = CURRENT_DATE
          AND a.status != 'cancelado'
          AND a.funcionaria_id = $1
        ORDER BY a.data_hora ASC
      `;
      params = [req.user.id];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar agenda do dia:', error);
    res.status(500).json({ message: 'Erro ao buscar agenda do dia.' });
  }
});

// ─── GET /api/agendamentos — admin vê todos ──────────────────
router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.id, a.data_hora, a.status, a.observacoes, a.criado_em,
        u.nome AS cliente_nome, u.telefone AS cliente_telefone,
        s.nome AS servico, s.preco AS servico_preco, s.id AS servico_id,
        f.nome AS funcionaria_nome, f.id AS funcionaria_id
      FROM agendamentos a
      JOIN users u ON u.id = a.usuario_id
      JOIN services s ON s.id = a.servico_id
      LEFT JOIN users f ON f.id = a.funcionaria_id
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
        a.id, a.data_hora, a.status, a.observacoes, a.criado_em,
        s.nome AS servico, s.preco AS servico_preco, s.id AS servico_id,
        f.nome AS funcionaria_nome
      FROM agendamentos a
      JOIN services s ON s.id = a.servico_id
      LEFT JOIN users f ON f.id = a.funcionaria_id
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
  const { servico_id, data_hora, observacoes, funcionaria_id } = req.body;

  if (!servico_id || !data_hora) {
    return res.status(400).json({ message: 'Serviço e data/hora são obrigatórios' });
  }

  if (new Date(data_hora) < new Date()) {
    return res.status(400).json({ message: 'Não é possível agendar para uma data no passado' });
  }

  try {
    // Se veio funcionaria_id, valida que ela realmente faz esse serviço
    if (funcionaria_id) {
      const vinculo = await pool.query(`
        SELECT 1 FROM funcionaria_servicos
        WHERE funcionaria_id = $1 AND servico_id = $2
      `, [funcionaria_id, servico_id]);

      if (vinculo.rows.length === 0) {
        return res.status(400).json({ message: 'Esta funcionária não realiza o serviço selecionado.' });
      }
    }

    // Conflito agora é POR FUNCIONÁRIA (não global).
    // Se não houver funcionaria_id definida, mantém checagem global
    // pra não sobrepor um horário "sem dono" com outro igual.
    const conflito = funcionaria_id
      ? await pool.query(`
          SELECT id FROM agendamentos
          WHERE data_hora = $1 AND funcionaria_id = $2 AND status != 'cancelado'
        `, [data_hora, funcionaria_id])
      : await pool.query(`
          SELECT id FROM agendamentos
          WHERE data_hora = $1 AND funcionaria_id IS NULL AND status != 'cancelado'
        `, [data_hora]);

    if (conflito.rows.length > 0) {
      return res.status(409).json({ message: 'Horário já reservado. Escolha outro horário.' });
    }

    const result = await pool.query(`
      INSERT INTO agendamentos (usuario_id, servico_id, data_hora, observacoes, funcionaria_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [req.user.id, servico_id, data_hora, observacoes || null, funcionaria_id || null]);

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

  const statusValidos = ['pendente', 'confirmado', 'cancelado', 'concluido'];
  if (!statusValidos.includes(status)) {
    return res.status(400).json({ message: 'Status inválido' });
  }

  try {
    let query, params;

    if (req.user.role === 'admin') {
      query = `UPDATE agendamentos SET status = $1 WHERE id = $2 RETURNING *`;
      params = [status, id];
    } else if (req.user.role === 'funcionaria') {
      // funcionária pode alterar status só dos próprios agendamentos
      query = `UPDATE agendamentos SET status = $1 WHERE id = $2 AND funcionaria_id = $3 RETURNING *`;
      params = [status, id, req.user.id];
    } else {
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

router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM agendamentos WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agendamento não encontrado.' });
    }

    res.json({ message: 'Agendamento excluído com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir agendamento:', error);
    res.status(500).json({ message: 'Erro ao excluir agendamento.' });
  }
});

module.exports = router;