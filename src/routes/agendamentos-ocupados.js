// ─── GET /api/agendamentos/horarios-ocupados ─────────────────
//
// Query param: ?data=YYYY-MM-DD
//
// Retorna um array de strings "HH:MM" com os horários que já
// têm agendamento ativo (pendente ou confirmado) naquela data.
//
// Adicione esta rota no arquivo agendamentos.js, ANTES das rotas
// que usam :id para evitar que "horarios-ocupados" seja tratado
// como um parâmetro dinâmico.
//
// Exemplo de inserção:
//   router.get('/horarios-ocupados', async (req, res) => { ... });
//   router.get('/meus', async (req, res) => { ... });
//   router.get('/', requireAdmin, async (req, res) => { ... });
//   ...

router.get('/horarios-ocupados', async (req, res) => {
  const { data } = req.query; // "YYYY-MM-DD"

  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return res.status(400).json({ message: 'Parâmetro "data" inválido. Use o formato YYYY-MM-DD.' });
  }

  try {
    // Busca todos os agendamentos ativos do dia e extrai só a hora
    const result = await pool.query(`
      SELECT TO_CHAR(data_hora AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS hora
      FROM agendamentos
      WHERE data_hora::date = $1::date
        AND status != 'cancelado'
      ORDER BY hora
    `, [data]);

    // Retorna array de strings: ["08:00", "09:30", ...]
    const horas = result.rows.map(r => r.hora);
    res.json(horas);
  } catch (error) {
    console.error('Erro ao buscar horários ocupados:', error);
    res.status(500).json({ message: 'Erro ao buscar horários ocupados.' });
  }
});