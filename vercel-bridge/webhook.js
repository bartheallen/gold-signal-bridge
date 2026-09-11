// api/webhook.js
// Recoit les messages du Bot Telegram (webhook Telegram -> Vercel).
// Parse le signal (regles, puis IA cloud gratuite en secours) et
// l'enregistre dans Supabase (Postgres, plan gratuit) pour que l'EA
// MT5 vienne le chercher ensuite.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // cle "service_role", jamais exposee au client
);

const SYMBOL_ALIASES = { GOLD: 'XAUUSD', OR: 'XAUUSD', XAUUSD: 'XAUUSD', 'XAU/USD': 'XAUUSD', XAU: 'XAUUSD' };
const ACTION_ALIASES = { BUY: 'BUY', LONG: 'BUY', ACHAT: 'BUY', ACHETER: 'BUY', SELL: 'SELL', SHORT: 'SELL', VENTE: 'SELL', VENDRE: 'SELL' };

function parseWithRules(text) {
  const t = text.toUpperCase();

  let symbol = null;
  for (const [alias, sym] of Object.entries(SYMBOL_ALIASES)) {
    if (new RegExp(`\\b${alias.replace('/', '\\/')}\\b`).test(t)) { symbol = sym; break; }
  }
  if (!symbol) return null;

  let action = null;
  for (const [alias, act] of Object.entries(ACTION_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`).test(t)) { action = act; break; }
  }
  if (!action) return null;

  const findNumber = (patterns) => {
    for (const p of patterns) {
      const m = t.match(p);
      if (m) {
        const v = parseFloat(m[1].replace(',', '.'));
        if (!isNaN(v)) return v;
      }
    }
    return null;
  };

  const entry = findNumber([/ENTR[YÉE]E?S?[:\s]+([0-9]+[.,]?[0-9]*)/, /@\s*([0-9]+[.,]?[0-9]*)/, /PRICE[:\s]+([0-9]+[.,]?[0-9]*)/]);
  const sl = findNumber([/SL[:\s]+([0-9]+[.,]?[0-9]*)/, /STOP\s*LOSS[:\s]+([0-9]+[.,]?[0-9]*)/]);
  const tpMatches = [...t.matchAll(/TP\s*[0-9]?[:\s]+([0-9]+[.,]?[0-9]*)/g)].map(m => parseFloat(m[1].replace(',', '.')));

  if (sl === null) return null; // regle de securite : sans SL clair, on ne trade pas

  return { symbol, action, entry, sl, tp: tpMatches };
}

async function parseWithAI(text) {
  const apiKey = process.env.AI_API_KEY;
  const apiUrl = process.env.AI_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
  const model = process.env.AI_MODEL || 'llama-3.1-8b-instant';

  if (!apiKey) return null;

  const prompt = `Tu extrais des signaux de trading depuis un message Telegram.
Reponds UNIQUEMENT avec un objet JSON valide, rien d'autre, exactement ce format:
{"symbol": "XAUUSD ou null", "action": "BUY ou SELL ou null", "entry": nombre ou null, "sl": nombre ou null, "tp": [liste de nombres]}
Si ce n'est pas un signal exploitable (pas de symbole ET action ET SL clairs), mets symbol/action/sl a null et tp a [].
Message: """${text}"""`;

  try {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.symbol || !parsed.action || !parsed.sl) return null;
    parsed.symbol = SYMBOL_ALIASES[String(parsed.symbol).toUpperCase()] || parsed.symbol;
    return parsed;
  } catch (e) {
    console.error('Erreur IA cloud:', e);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');

  if (process.env.WEBHOOK_SECRET && req.query.secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).send('unauthorized');
  }

  const update = req.body;
  const message = update?.message || update?.channel_post;
  if (!message || !message.text) return res.status(200).send('ignored');

  const text = message.text;
  const msgId = message.message_id;

  let signal = parseWithRules(text);
  let parsedBy = 'rules';
  if (!signal) {
    signal = await parseWithAI(text);
    parsedBy = 'ai_cloud';
  }

  if (signal) {
    const { data, error } = await supabase
      .from('signals')
      .insert({
        msg_id: msgId,
        symbol: signal.symbol,
        action: signal.action,
        entry: signal.entry || 0,
        sl: signal.sl,
        tp: signal.tp || [],
        parsed_by: parsedBy,
      })
      .select()
      .single();

    if (error) {
      console.error('Erreur insertion Supabase:', error);
    } else {
      console.log('Signal stocke:', data);
    }
  } else {
    console.log('Message ignore (non reconnu comme signal):', text.slice(0, 80));
  }

  res.status(200).send('OK');
}
