const express = require('express');
const pool = require('../db/connection');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/servicos — lista todos os ativos ────────────────
router.get('/', async (req, res) => {
  try {
    const todos = req.query.todos === 'true';
    const query = todos
      ? 'SELECT id, nome, descricao, preco, duracao, capacidade_simultanea, ativo FROM services ORDER BY nome'
      : 'SELECT id, nome, descricao, preco, duracao, capacidade_simultanea, ativo FROM services WHERE ativo = TRUE ORDER BY nome';

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar serviços:', error);
    res.status(500).json({ message: 'Erro ao buscar serviços' });
  }
});

// ─── POST /api/servicos — admin cria serviço ─────────────────
router.post('/', requireAdmin, async (req, res) => {
  const { nome, descricao, preco, duracao, capacidade_simultanea } = req.body;

  if (!nome || !preco) {
    return res.status(400).json({ message: 'Nome e preço são obrigatórios' });
  }

  if (capacidade_simultanea !== undefined && capacidade_simultanea < 1) {
    return res.status(400).json({ message: 'Capacidade simultânea deve ser pelo menos 1' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO services (nome, descricao, preco, duracao, capacidade_simultanea)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [nome, descricao || null, preco, duracao || 60, capacidade_simultanea || 1]
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
  const { nome, descricao, preco, duracao, capacidade_simultanea, ativo } = req.body;

  if (capacidade_simultanea !== undefined && capacidade_simultanea < 1) {
    return res.status(400).json({ message: 'Capacidade simultânea deve ser pelo menos 1' });
  }

  try {
    // Busca o serviço atual primeiro
    const atual = await pool.query('SELECT * FROM services WHERE id = $1', [id]);
    if (atual.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }

    const s = atual.rows[0];

    const result = await pool.query(
      `UPDATE services
       SET nome = $1,
           descricao = $2,
           preco = $3,
           duracao = $4,
           capacidade_simultanea = $5,
           ativo = $6
       WHERE id = $7
       RETURNING *`,
      [
        nome                  ?? s.nome,
        descricao             ?? s.descricao,
        preco                 ?? s.preco,
        duracao               ?? s.duracao,
        capacidade_simultanea ?? s.capacidade_simultanea,
        ativo                 ?? s.ativo,
        id
      ]
    );

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

router.get('/:id/funcionarias', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT u.id, u.nome, u.telefone, u.dia_folga, u.hora_inicio, u.hora_fim
       FROM funcionaria_servicos fs
       JOIN users u ON u.id = fs.funcionaria_id
       WHERE fs.servico_id = $1 AND u.role = 'funcionaria'
       ORDER BY u.nome`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar funcionárias do serviço:', error);
    res.status(500).json({ message: 'Erro ao buscar funcionárias do serviço' });
  }
});

// ─── GET /api/servicos/:id/funcionarias — lista funcionárias que fazem esse serviço ───
router.post('/:id/funcionarias', requireAdmin, async (req, res) => {
  const { id } = req.params; // servico_id
  const { funcionaria_id } = req.body;

  if (!funcionaria_id) {
    return res.status(400).json({ message: 'funcionaria_id é obrigatório' });
  }

  try {
    // Confirma que o serviço existe
    const servico = await pool.query('SELECT id FROM services WHERE id = $1', [id]);
    if (servico.rows.length === 0) {
      return res.status(404).json({ message: 'Serviço não encontrado' });
    }

    // Confirma que o usuário existe e é funcionária
    const funcionaria = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND role = 'funcionaria'`,
      [funcionaria_id]
    );
    if (funcionaria.rows.length === 0) {
      return res.status(404).json({ message: 'Funcionária não encontrada' });
    }

    const result = await pool.query(
      `INSERT INTO funcionaria_servicos (funcionaria_id, servico_id)
       VALUES ($1, $2)
       ON CONFLICT (funcionaria_id, servico_id) DO NOTHING
       RETURNING *`,
      [funcionaria_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ message: 'Funcionária já vinculada a esse serviço' });
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao vincular funcionária:', error);
    res.status(500).json({ message: 'Erro ao vincular funcionária ao serviço' });
  }
});

// ─── DELETE /api/servicos/:id/funcionarias/:funcionaria_id — desvincula ───
router.delete('/:id/funcionarias/:funcionaria_id', requireAdmin, async (req, res) => {
  const { id, funcionaria_id } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM funcionaria_servicos
       WHERE servico_id = $1 AND funcionaria_id = $2
       RETURNING *`,
      [id, funcionaria_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Vínculo não encontrado' });
    }

    res.json({ message: 'Funcionária desvinculada do serviço com sucesso' });
  } catch (error) {
    console.error('Erro ao desvincular funcionária:', error);
    res.status(500).json({ message: 'Erro ao desvincular funcionária do serviço' });
  }
});

module.exports = router;