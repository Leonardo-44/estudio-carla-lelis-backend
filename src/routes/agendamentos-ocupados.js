// ─── GET /api/agendamentos/horarios-ocupados ─────────────────
// Query params: ?data=YYYY-MM-DD&funcionaria_id=123 (funcionaria_id opcional)
router.get('/horarios-ocupados', async (req, res) => {
  const { data, funcionaria_id } = req.query;

  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return res.status(400).json({ message: 'Parâmetro "data" inválido. Use o formato YYYY-MM-DD.' });
  }

  try {
    const query = funcionaria_id
      ? `SELECT TO_CHAR(data_hora AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS hora
         FROM agendamentos
         WHERE data_hora::date = $1::date
           AND status != 'cancelado'
           AND funcionaria_id = $2
         ORDER BY hora`
      : `SELECT TO_CHAR(data_hora AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS hora
         FROM agendamentos
         WHERE data_hora::date = $1::date
           AND status != 'cancelado'
         ORDER BY hora`;

    const params = funcionaria_id ? [data, funcionaria_id] : [data];
    const result = await pool.query(query, params);

    res.json(result.rows.map(r => r.hora));
  } catch (error) {
    console.error('Erro ao buscar horários ocupados:', error);
    res.status(500).json({ message: 'Erro ao buscar horários ocupados.' });
  }
});