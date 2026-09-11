// api/signals.js
// Endpoint interroge par l'EA MT5 (WebRequest) pour recuperer les
// nouveaux signaux depuis Supabase.
// Query param "since" = dernier id deja traite par l'EA (0 au depart).
// Reponse : texte brut, une ligne par signal :
//   ID|SYMBOL|ACTION|ENTRY|SL|TP1|TP2

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const since = parseInt(req.query.since || '0', 10);
  const key = req.query.key;

  if (process.env.API_SECRET && key !== process.env.API_SECRET) {
    return res.status(401).send('unauthorized');
  }

  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .gt('id', since)
    .order('id', { ascending: true });

  if (error) {
    console.error('Erreur lecture Supabase:', error);
    return res.status(500).send('error');
  }

  const lines = (data || []).map((rec) => {
    const tp = rec.tp || [];
    const tp1 = tp[0] || 0;
    const tp2 = tp[1] || 0;
    return `${rec.id}|${rec.symbol}|${rec.action}|${rec.entry}|${rec.sl}|${tp1}|${tp2}`;
  });

  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send(lines.join('\n'));
}
