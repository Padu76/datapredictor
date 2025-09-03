import { useState, useEffect, useRef, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import axios from 'axios'
import Chart from 'chart.js/auto'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'

const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'DataPredictor',
  color: process.env.NEXT_PUBLIC_BRAND_COLOR || '#0ea5e9',
  logoPath: process.env.NEXT_PUBLIC_BRAND_LOGO  || '/logo.svg',
}
const PERIODS = [{key:'7',label:'7 giorni'},{key:'30',label:'30 giorni'},{key:'90',label:'90 giorni'}]

export default function Home(){
  const router = useRouter()
  const fileRef = useRef(null)
  const [rawRes,setRawRes]=useState(null)
  const [period,setPeriod]=useState('30')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [advisorLoading,setAdvisorLoading]=useState(false)
  const [advisorData,setAdvisorData]=useState(null)
  const [mappingOpen,setMappingOpen]=useState(false)
  const [headers,setHeaders]=useState([])
  const [mapping,setMapping]=useState({
    date:"",
    amount:"",
    price:"",
    qty:"",
    options:{ date_format:"", decimal:"," }
  })

  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  const reportRef = useRef(null)

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
  const api = axios.create({ baseURL: apiBase })

  // Carica analisi salvata da Supabase quando si arriva con ?analysisId
  useEffect(()=>{
    const { analysisId } = router.query || {}
    if(!analysisId || !supabase) return
    ;(async ()=>{
      try{
        setLoading(true); setError('')
        const { data, error } = await supabase.from('analyses').select('*').eq('id', analysisId).single()
        if(error) throw error
        setRawRes({
          kpi: data.kpi || {},
          forecast: data.forecast || {},
          anomalies: data.anomalies || [],
          actions: data.actions || [],
          timeseries: data.timeseries || null
        })
        // scroll alla sezione analisi
        setTimeout(()=>document.getElementById('analyze')?.scrollIntoView({behavior:'smooth'}), 200)
      }catch(e){
        setError(e.message || 'Errore caricamento analisi salvata')
      }finally{ setLoading(false) }
    })()
  }, [router.query])

  // Lettura locale header per wizard (CSV/XLSX)
  const readHeaders = async (file)=>{
    const name = file.name.toLowerCase()
    if(name.endsWith('.csv')){
      const text = await file.text()
      const firstLine = text.split(/\r?\n/).filter(Boolean)[0] || ''
      const cols = firstLine.split(';').length > firstLine.split(',').length ? firstLine.split(';') : firstLine.split(',')
      setHeaders(cols.map(c=>c.trim()))
    } else if(name.endsWith('.xlsx')){
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type:'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(ws, { header:1 })
      const first = json[0] || []
      setHeaders(first.map(c=>String(c).trim()))
    } else {
      setHeaders([])
    }
  }

  const openMapping = async()=>{
    setError('')
    const f = fileRef.current?.files?.[0] || null
    if(!f){ setError('Seleziona prima un file'); return }
    await readHeaders(f)
    const lower = (h)=>h?.toLowerCase?.()||''
    const suggest = (keys)=>headers.find(h=>keys.some(k=>lower(h)===k)) || ''
    setMapping(m=>({
      ...m,
      date: m.date || suggest(['date','data','order date','created_at']),
      amount: m.amount || suggest(['amount','revenue','ricavo','total','totale','valore']),
      price: m.price || suggest(['price','prezzo','unit_price']),
      qty: m.qty || suggest(['qty','quantita','quantity','qta'])
    }))
    setMappingOpen(true)
  }

  const onAnalyze = async()=>{
    setError('')
    setAdvisorData(null)
    const f = fileRef.current?.files?.[0] || null
    if(!f){ setError('Seleziona un file CSV/XLSX'); return }
    // scroll alla sezione analisi dopo click
    document.getElementById('analyze')?.scrollIntoView({behavior:'smooth'})
    setLoading(true)
    try{
      const form=new FormData()
      form.append('file', f)
      const hasMapping = mapping?.date || mapping?.amount || (mapping?.price && mapping?.qty)
      if(hasMapping){
        form.append('mapping', JSON.stringify(mapping))
      }
      const r=await api.post('/analyze', form, {headers:{'Content-Type':'multipart/form-data'}})
      setRawRes(r.data)
      if(supabase){
        await supabase.from('analyses').insert({
          created_at: new Date().toISOString(),
          kpi: r.data.kpi, forecast: r.data.forecast,
          anomalies: r.data.anomalies, actions: r.data.actions,
          timeseries_len: (r.data.timeseries||[]).length
        })
      }
      setMappingOpen(false)
    }catch(e){
      setError(e?.response?.data?.detail || e.message || 'Errore sconosciuto')
    }finally{ setLoading(false) }
  }

  // Serie filtrata + MoM/YoY
  const view = useMemo(()=>{
    if(!rawRes?.timeseries) return null
    const ts = rawRes.timeseries.map(p => ({...p, d: new Date(p.date)}))
    if(ts.length===0) return null
    const end = ts[ts.length-1].d
    const days = parseInt(period,10)
    const start = new Date(end); start.setDate(end.getDate()-(days-1))
    const current = ts.filter(p => p.d >= start)
    const shiftRange = (a,b,months=0,years=0)=>[new Date(a.getFullYear()+years, a.getMonth()+months, a.getDate()), new Date(b.getFullYear()+years, b.getMonth()+months, b.getDate())]
    const [pmStart, pmEnd] = shiftRange(start, end, -1, 0)
    const [pyStart, pyEnd] = shiftRange(start, end, 0, -1)
    const inRange = (p, a, b) => p.d >= a && p.d <= b
    const seriesMoM = ts.filter(p => inRange(p, pmStart, pmEnd))
    const seriesYoY = ts.filter(p => inRange(p, pyStart, pyEnd))
    const sum = arr => arr.reduce((s,x)=>s + (x?.value||0), 0)
    const revenue = sum(current), mom=sum(seriesMoM), yoy=sum(seriesYoY)
    const momPct = mom ? ((revenue-mom)/mom*100) : null
    const yoyPct = yoy ? ((revenue-yoy)/yoy*100) : null
    return { current, revenue, momPct, yoyPct, end }
  }, [rawRes, period])

  // Grafico
  useEffect(()=>{
    if(!view?.current || !canvasRef.current) return
    const labels = view.current.map(p => p.date)
    const values = view.current.map(p => p.value)
    if(chartRef.current){ chartRef.current.destroy() }
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Ricavi giornalieri', data: values }] },
      options: { responsive: true, maintainAspectRatio: false, plugins:{ legend:{display:false}},
        scales:{ x:{ ticks:{ maxRotation:0, autoSkip:true, maxTicksLimit:8 }}, y:{ beginAtZero:true } } }
    })
  }, [view])

  // Advisor Pro → /advisor
  const generateAdvisor = async()=>{
    if(!rawRes){ setError('Esegui prima un’analisi.'); return }
    setAdvisorLoading(true); setError('')
    try{
      const ctx = { period, mom_pct: view?.momPct ?? null, yoy_pct: view?.yoyPct ?? null }
      const r = await axios.post(`${apiBase}/advisor`, { analysis: rawRes, context: ctx })
      setAdvisorData(r.data)
    }catch(e){
      setError(e?.response?.data?.detail || e.message || 'Errore generazione advisor')
    }finally{ setAdvisorLoading(false) }
  }

  // Utils dataURL per PDF
  const fetchDataURL = async (path) => {
    const res = await fetch(path)
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
  }

  // PDF brandizzato
  const exportPDF = async()=>{
    if(!reportRef.current) return
    const doc = new jsPDF({ unit:'px', format:'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    doc.setFillColor(BRAND.color); doc.rect(0, 0, pageWidth, 56, 'F')
    try { const logoData = await fetchDataURL(BRAND.logoPath); doc.addImage(logoData, 'SVG', 18, 12, 32, 32) } catch {}
    doc.setTextColor('#ffffff'); doc.setFontSize(18); doc.text(`${BRAND.name} — Report`, 60, 32)
    doc.setFontSize(11); doc.text(`Generato: ${new Date().toLocaleString('it-IT')}`, 60, 46)
    const canvas = await html2canvas(reportRef.current, {scale: 2})
    const imgData = canvas.toDataURL('image/png')
    const margin = 20, usable = pageWidth - margin*2
    const ratio = usable / canvas.width, imgHeight = canvas.height * ratio
    doc.addImage(imgData, 'PNG', margin, 64, usable, imgHeight)
    doc.save('DataPredictor_Report.pdf')
  }

  // UI helpers
  const scrollToAnalyze = ()=> document.getElementById('analyze')?.scrollIntoView({behavior:'smooth'})
  const scrollToHow = ()=> document.getElementById('how')?.scrollIntoView({behavior:'smooth'})

  return (
    <>
      <Head><title>{BRAND.name}</title></Head>

      {/* HERO */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-tag">AI Data Advisor</div>
          <h1>Trasforma file <span className="grad">CSV/XLSX</span> in insight e piani d’azione.</h1>
          <p className="hero-sub">
            Carichi i dati, <b>DataPredictor</b> li legge come un consulente:
            KPI chiave, forecast, anomalie e un <b>report discorsivo</b> con to-do operativi a 7/30/90 giorni.
          </p>
          <div className="hero-cta">
            <button onClick={scrollToAnalyze}>Prova subito</button>
            <button className="btn-outline" onClick={scrollToHow}>Scopri come funziona</button>
          </div>
          <div className="hero-badges">
            <span>• Upload CSV/XLSX</span>
            <span>• Advisor AI</span>
            <span>• Export PDF brandizzato</span>
            <span>• Salvataggio analisi</span>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section">
        <div className="container">
          <h2>Cosa può fare l’app</h2>
          <div className="grid3">
            <div className="feature">
              <div className="icn">📈</div>
              <h3>KPI & Trend</h3>
              <p>Ricavi 30gg, ticket medio, andamento 2w vs 2w, MoM/YoY e grafico giornaliero pulito.</p>
            </div>
            <div className="feature">
              <div className="icn">🧠</div>
              <h3>Advisor AI</h3>
              <p>Report di 25–30 righe: lettura dati, cause probabili, rischi e azioni prioritarie.</p>
            </div>
            <div className="feature">
              <div className="icn">🧪</div>
              <h3>What-if Pricing</h3>
              <p>Simula l’impatto di prezzo, elasticità e COGS su ricavi e margini in 30 giorni.</p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section alt" id="how">
        <div className="container">
          <h2>Come funziona</h2>
          <ol className="steps">
            <li><b>1.</b> Carica un file (.csv o .xlsx)</li>
            <li><b>2.</b> (Opzionale) <i>Mappa le colonne</i> (Data, Amount o Prezzo×Qty)</li>
            <li><b>3.</b> Premi <i>Analizza</i>: KPI, forecast e anomalie in pochi secondi</li>
            <li><b>4.</b> Genera il <i>Report consulente</i> + Playbook 7/30/90</li>
            <li><b>5.</b> Esporta il <i>PDF brandizzato</i> e condividi</li>
          </ol>
        </div>
      </section>

      {/* FORMATS */}
      <section className="section">
        <div className="container">
          <h2>Formati supportati</h2>
          <div className="grid3">
            <div className="card small">
              <h4>CSV</h4>
              <p>Separatore virgola o punto-e-virgola. Decimale virgola o punto.</p>
            </div>
            <div className="card small">
              <h4>XLSX</h4>
              <p>Prima riga = intestazioni. Prima sheet analizzata.</p>
            </div>
            <div className="card small">
              <h4>Colonne minime</h4>
              <p><b>Data</b> e <b>Amount</b> — oppure <b>Prezzo</b> + <b>Quantità</b>.</p>
            </div>
          </div>
        </div>
      </section>

      {/* PRIVACY */}
      <section className="section alt">
        <div className="container">
          <h2>Privacy & controllo</h2>
          <p>I file vengono processati per estrarre KPI e serie giornaliere. Puoi scegliere di non conservarli; salviamo solo le analisi per lo storico. In qualsiasi momento puoi richiedere la rimozione.</p>
        </div>
      </section>

      {/* ANALYZE SECTION */}
      <main className="container" id="analyze" style={{paddingTop:24}}>
        <h2>Analizza ora</h2>
        <p className="muted" style={{marginTop:-6}}>Carica un file, opzionalmente mappa le colonne e ottieni subito KPI, grafico e advisor.</p>

        <section className="toolbar">
          <input ref={fileRef} type="file" accept=".csv,.xlsx" onChange={()=>{ setError(''); setHeaders([]); }} />
          <button onClick={openMapping}>Mappa colonne</button>
          <button onClick={onAnalyze} disabled={loading}>{loading?'Analisi...':'Analizza'}</button>

          <div className="period">
            <label>Periodo:</label>
            <select value={period} onChange={e=>setPeriod(e.target.value)}>
              {PERIODS.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>

          <button onClick={exportPDF} disabled={!rawRes}>Esporta PDF</button>
          <Link href="/history" className="link">Storico Analisi</Link>
        </section>
        {error && <p className="error">{error}</p>}

        {/* Wizard mappatura */}
        {mappingOpen && (
          <div className="modal">
            <div className="modal-card">
              <h3>Mappatura colonne</h3>
              {headers.length===0 ? <p>Seleziona un file per vedere le intestazioni.</p> : (
                <>
                  <div className="grid2">
                    <div>
                      <label>Data *</label>
                      <select value={mapping.date} onChange={e=>setMapping({...mapping, date:e.target.value})}>
                        <option value="">-- seleziona --</option>
                        {headers.map(h=><option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <label>Amount</label>
                      <select value={mapping.amount} onChange={e=>setMapping({...mapping, amount:e.target.value})}>
                        <option value="">-- (oppure usa Prezzo×Qty) --</option>
                        {headers.map(h=><option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <label>Prezzo (unit)</label>
                      <select value={mapping.price} onChange={e=>setMapping({...mapping, price:e.target.value})}>
                        <option value="">-- opzionale --</option>
                        {headers.map(h=><option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <label>Quantità</label>
                      <select value={mapping.qty} onChange={e=>setMapping({...mapping, qty:e.target.value})}>
                        <option value="">-- opzionale --</option>
                        {headers.map(h=><option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid2">
                    <div>
                      <label>Formato data</label>
                      <select value={mapping.options.date_format} onChange={e=>setMapping({...mapping, options:{...mapping.options, date_format:e.target.value}})}>
                        <option value="">Auto</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                        <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                        <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      </select>
                    </div>
                    <div>
                      <label>Separatore decimale</label>
                      <select value={mapping.options.decimal} onChange={e=>setMapping({...mapping, options:{...mapping.options, decimal:e.target.value}})}>
                        <option value=",">Virgola (,)</option>
                        <option value=".">Punto (.)</option>
                      </select>
                    </div>
                  </div>
                  <p className="muted" style={{marginTop:8}}>
                    Minimo richiesto: <b>Data</b> e <b>Amount</b> (oppure <b>Prezzo</b> + <b>Quantità</b>).
                  </p>
                </>
              )}
              <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:12}}>
                <button className="btn-outline" onClick={()=>setMappingOpen(false)}>Chiudi</button>
                <button onClick={()=>{ setMappingOpen(false); }}>Ok</button>
              </div>
            </div>
          </div>
        )}

        {/* Report */}
        <section ref={reportRef}>
          {rawRes && (
            <>
              <section className="kpis">
                <div className="card"><div className="kpi-title">Ricavi 30gg</div><div className="kpi-value">€ {rawRes.kpi?.revenue_30d?.toLocaleString?.('it-IT') ?? rawRes.kpi?.revenue_30d}</div></div>
                <div className="card"><div className="kpi-title">Giorni con vendite</div><div className="kpi-value">{rawRes.kpi?.orders_days_positive_30d}</div></div>
                <div className="card"><div className="kpi-title">Ticket medio</div><div className="kpi-value">€ {rawRes.kpi?.avg_ticket?.toFixed?.(2) ?? rawRes.kpi?.avg_ticket}</div></div>
                <div className="card">
                  <div className="kpi-title">Trend 2w vs 2w</div>
                  <div className={`kpi-value ${rawRes.kpi?.trend_last_2w_vs_prev_2w_pct >= 0 ? 'pos' : 'neg'}`}>{rawRes.kpi?.trend_last_2w_vs_prev_2w_pct}%</div>
                </div>
              </section>

              <section className="diff">
                <span>MoM: {view?.momPct===null ? 'n/d' : `${view.momPct.toFixed(1)}%`}</span>
                <span>YoY: {view?.yoyPct===null ? 'n/d' : `${view.yoyPct.toFixed(1)}%`}</span>
              </section>

              <section className="chart-wrap">
                <h3>Ricavi giornalieri</h3>
                <div className="chart-box"><canvas ref={canvasRef} /></div>
              </section>

              <section className="advisor">
                <h3>Advisor Pro</h3>
                <button onClick={generateAdvisor} disabled={advisorLoading || !rawRes}>{advisorLoading ? 'Generazione...' : 'Genera report consulente'}</button>
                {advisorData && (
                  <>
                    <pre className="box" style={{whiteSpace:'pre-wrap'}}>{advisorData.advisor_text}</pre>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
                      <div className="card">
                        <h4>Playbook 7 giorni</h4>
                        <ul>{(advisorData.playbook?.['7d']||[]).map((x,i)=><li key={i}>{x}</li>)}</ul>
                      </div>
                      <div className="card">
                        <h4>Playbook 30 giorni</h4>
                        <ul>{(advisorData.playbook?.['30d']||[]).map((x,i)=><li key={i}>{x}</li>)}</ul>
                      </div>
                      <div className="card">
                        <h4>Playbook 90 giorni</h4>
                        <ul>{(advisorData.playbook?.['90d']||[]).map((x,i)=><li key={i}>{x}</li>)}</ul>
                      </div>
                    </div>
                    <p className="muted">Modalità: {advisorData.mode}</p>
                  </>
                )}
              </section>

              {/* Azioni dal backend */}
              <section className="actions">
                <h3>Azioni consigliate</h3>
                {(!rawRes.actions || rawRes.actions.length===0) && <p>Nessuna azione specifica.</p>}
                <ol>
                  {(rawRes.actions||[]).map((a,i)=>(<li key={i}><b>{a.title}</b> — impatto atteso {a.expected_uplift_pct}% — priorità {a.priority}</li>))}
                </ol>
              </section>
            </>
          )}
        </section>
      </main>

      <style jsx>{`
        /* HERO */
        .hero{background:linear-gradient(180deg, rgba(14,165,233,.12), transparent), radial-gradient(600px 300px at 10% -10%, rgba(14,165,233,.25), transparent), radial-gradient(600px 300px at 90% -20%, rgba(14,165,233,.18), transparent)}
        .hero-inner{max-width:1000px;margin:0 auto;padding:64px 24px 32px;text-align:center}
        .hero-tag{display:inline-block;padding:6px 10px;border:1px solid var(--border);border-radius:999px;font-size:12px;color:var(--muted);background:var(--card-bg)}
        .hero h1{font-size:36px;line-height:1.15;margin:14px 0 8px}
        .grad{background:linear-gradient(90deg, #38bdf8, #0ea5e9);-webkit-background-clip:text;background-clip:text;color:transparent}
        .hero-sub{max-width:820px;margin:0 auto;color:var(--muted);font-size:18px}
        .hero-cta{display:flex;gap:12px;justify-content:center;margin-top:16px}
        .hero-badges{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-top:12px;color:var(--muted);font-size:14px}

        /* SECTIONS */
        .section{padding:40px 24px}
        .section.alt{background:var(--card-bg)}
        .container{max-width:1000px;margin:0 auto}
        h2{margin:0 0 12px}
        .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
        .feature{background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:16px}
        .icn{font-size:22px}
        .steps{margin:0;padding-left:18px;color:var(--text)}

        /* ANALYZE */
        .toolbar { display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin:12px 0 6px }
        .period { margin-left:16px; display:flex; gap:8px; align-items:center }
        button { margin-left:0; padding:10px 16px; background: var(--brand); color:#fff; border:0; border-radius:8px; cursor:pointer; font-weight:600 }
        .btn-outline { background:transparent; border:1px solid var(--border); color: var(--text); border-radius:8px; padding:10px 16px; cursor:pointer }
        .link { margin-left:16px; color: var(--brand); text-decoration:none }
        .error { color: var(--error); margin-top:8px; }

        .kpis { display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; margin: 16px 0; }
        .card { padding:14px; border:1px solid var(--border); border-radius:12px; background: var(--card-bg); }
        .card.small{padding:14px}
        .kpi-title { color: var(--muted); font-size:13px; }
        .kpi-value { font-size:20px; font-weight:700; margin-top:6px; }
        .kpi-value.pos { color:#059669; } .kpi-value.neg { color:#dc2626; }

        .diff { display:flex; gap:16px; flex-wrap:wrap; margin:8px 0; color: var(--text) }
        .chart-box { position:relative; height:320px; border:1px solid var(--border); border-radius:12px; padding:8px; background: var(--card-bg); }

        /* Modal */
        .modal{position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; padding:16px; z-index:50}
        .modal-card{ background: var(--bg); color: var(--text); border:1px solid var(--border); border-radius:12px; padding:16px; width:680px; max-width:100% }
        .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        label{display:block; font-size:13px; color:var(--muted); margin-bottom:4px}
        select, input[type="number"], input[type="text"]{ width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; background:var(--bg); color:var(--text) }

        @media (max-width: 900px){
          .grid3{ grid-template-columns:1fr; }
          .kpis{ grid-template-columns:1fr 1fr; }
        }
        @media (max-width: 600px){
          .kpis{ grid-template-columns:1fr; }
        }
      `}</style>
    </>
  )
}
