// lib/storage.js additions
import { createClient } from '@supabase/supabase-js';

let _client = null;
function client() {
  if (!_client) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error('Supabase not configured');
    }
    _client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return _client;
}

export function canonicalizePayload(row) {
  // Ensure snake_case and JSON types for storage
  const c = {
    id: row.id,
    title: row.title || (row.target ? `Analisi ${row.target}` : 'Analisi'),
    target: row.target ?? row.Target ?? row.metric ?? row.column ?? null,
    date_col: row.date_col ?? row.dateCol ?? row.date ?? row.time ?? null,
    stats: row.stats ?? null,
    forecast: row.forecast ?? null,
    advisor: row.advisor ?? null,
    file_meta: row.file_meta ?? null,
  };
  // If any string JSON, parse
  try { if (typeof c.stats === 'string') c.stats = JSON.parse(c.stats); } catch {}
  try { if (typeof c.forecast === 'string') c.forecast = JSON.parse(c.forecast); } catch {}
  try { if (typeof c.advisor === 'string') c.advisor = JSON.parse(c.advisor); } catch {}
  try { if (typeof c.file_meta === 'string') c.file_meta = JSON.parse(c.file_meta); } catch {}
  return c;
}

export async function normalizeAllAnalyses({ limit = 1000 } = {}) {
  const s = client();
  const { data, error } = await s.from('analyses').select('*').limit(limit);
  if (error) throw error;
  const rows = data || [];
  let ok = 0, fail = 0;
  for (const r of rows) {
    const c = canonicalizePayload(r);
    // remove id from update body
    const { id, ...body } = c;
    const { error: e2 } = await s.from('analyses').update(body).eq('id', r.id);
    if (e2) fail++; else ok++;
  }
  return { total: rows.length, ok, fail };
}
