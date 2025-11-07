// pages/api/history2/normalize.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { data, error } = await supabase
      .from('analyses')
      .select('id, advisor');
    if (error) throw error;

    let updated = 0;
    const toArr = v => Array.isArray(v)
      ? v
      : (typeof v === 'string'
          ? v.split(/\r?\n+/).map(s=>s.replace(/^\s*[-•\d\.)]\s*/,'').trim()).filter(Boolean)
          : (v && typeof v === 'object' ? Object.values(v).flat() : []));

    for (const row of data || []) {
      const adv = row.advisor || null;
      if (!adv) continue;

      const normalized = {
        ...adv,
        horizonActions: {
          short: toArr(adv?.horizonActions?.short || adv?.actions?.short),
          medium: toArr(adv?.horizonActions?.medium || adv?.actions?.medium),
          long: toArr(adv?.horizonActions?.long || adv?.actions?.long),
        },
        risks: toArr(adv?.risks || adv?.watchouts),
      };

      // solo se cambia qualcosa
      if (JSON.stringify(adv) !== JSON.stringify(normalized)) {
        const { error: upErr } = await supabase
          .from('analyses')
          .update({ advisor: normalized })
          .eq('id', row.id);
        if (upErr) throw upErr;
        updated++;
      }
    }

    return res.status(200).json({ ok: true, total: data?.length || 0, updated });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
