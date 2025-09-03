// apps/web/pages/history.jsx
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import ReportCard from "../components/ReportCard";
import { supabase } from "../lib/supabaseClient";

const brandColor = process.env.NEXT_PUBLIC_BRAND_COLOR || "#f97316";
const brandName = process.env.NEXT_PUBLIC_BRAND_NAME || "DataPredictor";

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString("it-IT");
  } catch {
    return "—";
  }
}

export default function History() {
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState("");

  const selectedRow = useMemo(
    () => rows.find((r) => r.id === selectedId) || rows[0] || null,
    [rows, selectedId]
  );

  // Carica elenco analisi
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const { data, error } = await supabase
          .from("analyses")
          .select("id, created_at, name, kpi")
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        setRows(data || []);
      } catch (e) {
        setError(e.message || "Errore di caricamento");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Rename (campo opzionale "name")
  const handleRename = async (row) => {
    const current = row?.name || "";
    const name = window.prompt("Nuovo nome analisi:", current);
    if (name === null) return;
    try {
      setMutating(true);
      const { error } = await supabase
        .from("analyses")
        .update({ name })
        .eq("id", row.id);
      if (error) throw error;
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, name } : r)));
    } catch (e) {
      alert(e.message || "Errore rinomina");
    } finally {
      setMutating(false);
    }
  };

  // Delete (soft se hai un campo deleted_at; qui hard per semplicità)
  const handleDelete = async (row) => {
    if (!window.confirm("Eliminare definitivamente questa analisi?")) return;
    try {
      setMutating(true);
      const { error } = await supabase.from("analyses").delete().eq("id", row.id);
      if (error) throw error;
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      if (selectedId === row.id) setSelectedId(null);
    } catch (e) {
      alert(e.message || "Errore eliminazione");
    } finally {
      setMutating(false);
    }
  };

  return (
    <>
      <Head>
        <title>Storico Analisi — {brandName}</title>
      </Head>

      <main className="min-h-screen bg-gray-100">
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-sm text-gray-500 hover:underline">
                ← Home
              </Link>
              <h1 className="text-2xl md:text-3xl font-extrabold">
                Storico Analisi
              </h1>
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

        <div className="max-w-6xl mx-auto px-4 py-8 grid md:grid-cols-5 gap-6">
          {/* Lista sinistra */}
          <aside className="md:col-span-2 bg-white rounded-2xl shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Analisi salvate</h2>
              {loading && <span className="text-sm text-gray-400">Carico…</span>}
            </div>

            {error && (
              <div className="text-red-600 text-sm mb-3">{error}</div>
            )}

            {(!loading && rows.length === 0) && (
              <div className="text-gray-500 text-sm">
                Nessuna analisi salvata.
              </div>
            )}

            <ul className="space-y-2 max-h-[65vh] overflow-auto pr-1">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className={`rounded-xl border p-3 transition ${
                    selectedRow?.id === r.id
                      ? "border-gray-900 bg-gray-50"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold truncate">
                        {r.name || "Analisi senza nome"}
                      </div>
                      <div className="text-xs text-gray-500 ml-2 shrink-0">
                        {formatDateTime(r.created_at)}
                      </div>
                    </div>
                    <div className="text-sm text-gray-500 mt-1 truncate">
                      {r?.kpi?.revenue_30d != null ? (
                        <>Ricavi 30gg: {new Intl.NumberFormat("it-IT", {
                          style: "currency",
                          currency: "EUR",
                        }).format(r.kpi.revenue_30d)}</>
                      ) : (
                        "—"
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-2 mt-3">
                    <Link
                      href={`/?analysisId=${r.id}`}
                      className="text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-100"
                    >
                      Apri
                    </Link>
                    <button
                      onClick={() => handleRename(r)}
                      className="text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-100"
                      disabled={mutating}
                    >
                      Rinomina
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
                      className="text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-100 text-red-600"
                      disabled={mutating}
                    >
                      Elimina
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </aside>

          {/* Dettaglio/Report */}
          <section className="md:col-span-3 space-y-4">
            {!selectedRow && (
              <div className="bg-white rounded-2xl shadow p-8 text-center text-gray-500">
                Seleziona un’analisi nella lista per vedere il report.
              </div>
            )}

            {selectedRow && (
              <>
                <div className="bg-white rounded-2xl shadow p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold">
                      {selectedRow.name || "Analisi senza nome"}
                    </h2>
                    <span className="text-sm text-gray-500">
                      {formatDateTime(selectedRow.created_at)}
                    </span>
                  </div>
                  <Link
                    href={`/?analysisId=${selectedRow.id}`}
                    className="px-3 py-2 rounded-lg text-white text-sm font-semibold shadow"
                    style={{ backgroundColor: brandColor }}
                  >
                    Apri in dashboard
                  </Link>
                </div>

                <ReportCard data={selectedRow.kpi || {}} />
              </>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
