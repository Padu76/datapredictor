import { createClient } from '@supabase/supabase-js';

let supabase = null;
export function hasSupabase() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
if (hasSupabase()) {
  supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

// Normalizza un record proveniente da DB (snake_case/camelCase)
export function normalizeRow(row) {
  if (!row) return row;
  const r = { ...row };
  // target
  r.target = r.target ?? r.Target ?? r.metric ?? r.column ?? '';
  // date col
  r.date_col = r.date_col ?? r.dateCol ?? r.date ?? r.time ?? '';
  // forecast/advisor/stats/file_meta in json
  try { if (typeof r.forecast === 'string') r.forecast = JSON.parse(r.forecast); } catch {}
  try { if (typeof r.advisor === 'string') r.advisor = JSON.parse(r.advisor); } catch {}
  try { if (typeof r.stats === 'string') r.stats = JSON.parse(r.stats); } catch {}
  try { if (typeof r.file_meta === 'string') r.file_meta = JSON.parse(r.file_meta); } catch {}
  // title fallback
  r.title = r.title || (r.target ? `Analisi ${r.target}` : 'Analisi');
  return r;
}

export async function saveAnalysis(payload) {
  if (!supabase) throw new Error('Supabase not configured');
  // persistiamo in snake_case coerente
  const body = {
    title: payload.title || (payload.target ? `Analisi ${payload.target}` : 'Analisi'),
    target: payload.target || null,
    date_col: payload.date_col || payload.dateCol || null,
    stats: payload.stats || null,
    forecast: payload.forecast || null,
    advisor: payload.advisor || null,
    file_meta: payload.file_meta || null,
  };
  const { data, error } = await supabase.from('analyses').insert(body).select('*').single();
  if (error) throw error;
  return normalizeRow(data);
}

export async function listAnalyses(limit = 50) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(normalizeRow);
}

export async function getAnalysis(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('analyses').select('*').eq('id', id).single();
  if (error) throw error;
  return normalizeRow(data);
}
