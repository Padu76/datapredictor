import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseAnon) {
  supabase = createClient(supabaseUrl, supabaseAnon);
}

export function hasSupabase() {
  return !!supabase;
}

export async function saveAnalysis(data) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: row, error } = await supabase.from('analyses').insert([data]).select().single();
  if (error) throw error;
  return row;
}

export async function listAnalyses(limit = 20) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('analyses').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

export async function getAnalysis(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('analyses').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}
