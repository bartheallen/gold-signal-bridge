// api/signals.js
// Endpoint interroge par l'EA MT5 (WebRequest) pour recuperer les
// nouveaux signaux depuis Vercel KV.
// Query param "since" = dernier id deja traite par l'EA (0 au depart).
// Reponse : texte brut, une ligne par signal :
//   ID|SYMBOL|ACTION|ENTRY|SL|TP1|TP2

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const since = parseInt(req.query.since || '0', 10);
  const key = req.query.key;

  if (process.env.API_SECRET && key !== process.env.API_SECRET) {
    return res.status(401).send('unauthorized');
  }

  const all = await kv.lrange('signals_queue', 0, -1);
  const lines = [];

  for (const raw of all) {
    const rec = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (rec.id <= since) continue;
    const tp1 = rec.tp?.[0] || 0;
    const tp2 = rec.tp?.[1] || 0;
    lines.push(`${rec.id}|${rec.symbol}|${rec.action}|${rec.entry}|${rec.sl}|${tp1}|${tp2}`);
  }

  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send(lines.join('\n'));
}
