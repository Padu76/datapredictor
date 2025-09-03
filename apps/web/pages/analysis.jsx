// apps/web/pages/analysis.jsx
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import AdvisorPanel from "../components/AdvisorPanel";
import { supabase } from "../lib/supabaseClient";

const brandColor = process.env.NEXT_PUBLIC_BRAND_COLOR || "#f97316";
const brandName  = process.env.NEXT_PUBLIC_BRAND_NAME  || "DataPredictor";

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString("it-IT");
  } catch {
    return "—";
  }
}

export default function AnalysisPage() {
  const router = useRouter();
  const { id, analysisId } = router.query;
  const recordId = (id || analysisId || "").toString();

  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // carica record da Supabase
  useEffect(() => {
    if (!recordId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr("");
      try {
        const { data, error } = await supabase
          .from("analyses")
          .select("id, created_at, name, kpi, advisor_text, report, playbook, actions")
          .eq("id", recordId)
          .single();
        if (error) throw error;
        if (!cancelled) setRow(data);
      } catch (e) {
        if (!cancelled) setErr(e.message || "Errore di caricamento");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [recordId]);

  const title    = useMemo(() => row?.name || "Analisi", [row]);
  const kpi      = useMemo(() => row?.kpi || {}, [row]);
  const advisor  = useMemo(() => (row?.advisor_text || row?.report || ""), [row]);
  const playbook = useMemo(() => row?.playbook, [row]);
  const actions  = useMemo(() => row?.actions, [row]);

  return (
    <>
      <Head>
        <title>{title} — {brandName}</title>
      </Head>

      <main className="min-h-screen bg-gray-100">
        {/* Topbar */}
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-sm text-gray-500 hover:underline">← Home</Link>
              <Link href="/history" className="text-sm text-gray-500 hover:underline">Storico</Link>
              <h1 className="text-2xl md:text-3xl font-extrabold">{title}</h1>
            </div>
            <Link
              href="/upload"
              className="px-4 py-2 rounded-xl text-white font-semibold shadow"
              style={{ backgroundColor: brandColor }}
            >
              + Nuova analisi
            </Link>
          </div>
        </header>

        {/* Contenuto */}
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Meta / stato */}
          <div className="bg-white rounded-2xl shadow p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-sm text-gray-500">ID</div>
              <div className="font-mono text-sm">{recordId || "—"}</div>
              <div className="text-sm text-gray-500 ml-4">Creato</div>
              <div className="text-sm">{row ? formatDateTime(row.created_at) : "—"}</div>
            </div>
            <div className="text-sm">
              {loading ? <span className="text-gray-500">Carico…</span> : err ? <span className="text-red-600">{err}</span> : <span className="text-green-600">Pronto</span>}
            </div>
          </div>

          {/* Report consulenziale “bello” */}
          <AdvisorPanel
            loading={loading}
            kpi={kpi}
            reportLLM={advisor}
            playbooks={playbook}
            actions={actions}
          />
        </div>
      </main>
    </>
  );
}

