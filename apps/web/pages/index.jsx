import { useState, useEffect, useRef, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import axios from 'axios'
import Chart from 'chart.js/auto'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { supabase } from '../lib/supabaseClient'

const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'DataPredictor',
  color: process.env.NEXT_PUBLIC_BRAND_COLOR || '#0ea5e9',
  logoPath: process.env.NEXT_PUBLIC_BRAND_LOGO  || '/logo.svg',
}

const PERIODS = [
  {key:'7',  label:'7 giorni'},
  {key:'30', label:'30 giorni'},
  {key:'90', label:'90 giorni'},
]

export default function Home(){
  const router = useRouter()
  const fileRef = useRef(null)
  const [rawRes,setRawRes]=useState(null)
  const [period,setPeriod]=useState('30')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  const reportRef = useRef(null)

  const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000' })

  // Se arrivo con ?analysisId carico l’analisi salvata
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
      }catch(e){
        setError(e.message || 'Errore caricamento analisi salvata')
      }finally{ setLoading(false) }
    })()
  }, [router.query])

  const onAnalyze = async()=>{
    setError('')
    const f = fileRef.current?.files?.[0] || null
    if(!f){ setError('Seleziona un file CSV/XLSX'); return }
    setLoading(true)
    try{
      const form=new FormData()
      form.append('file', f)
      const r=await api.post('/analyze', form, {headers:{'Content-Type':'multipart/form-data'}})
      setRawRes(r.data)
      if(supabase){
        await supabase.from('analyses').insert({
          created_at: new Date().toISOString(),
          kpi: r.data.kpi,
          forecast: r.data.forecast,
          anomalies: r.data.anomalies,
          actions: r.data.actions,
          timeseries_len: (r.data.timeseries||[]).length
        })
      }
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

  const kpi = rawRes?.kpi || {}
  const actions = rawRes?.actions || []

  // Advisor
  const advisor = useMemo(()=>{
    if(!rawRes) return null
    const tips = []
    const trend = kpi.trend_last_2w_vs_prev_2w_pct ?? 0
    const forecastChange = rawRes?.forecast?.change_vs_last30_pct ?? 0
    const anomalies = rawRes?.anomalies || []
    if(trend > 10) tips.push("Trend forte in crescita: aumenta budget su sorgenti top e scala le creatività vincenti.")
    else if (trend < -5) tips.push("Trend in calo: rivedi offerte/pricing e attiva promo tattica 7 giorni.")
    else tips.push("Trend stabile: consolida best seller e testa varianti di prezzo/pacchetti.")
    if(forecastChange < 0) tips.push("Forecast sotto ultimi 30 gg: ribilancia stock e spingi prodotti ad alta conversione.")
    else tips.push("Forecast sopra ultimi 30 gg: prepara scorte e customer care per sostenere il volume.")
    if(anomalies.length>0) tips.push(`Rilevate anomalie in ${anomalies.length} giorni: controlla prezzi, resi, interruzioni ads.`)
    if(view?.momPct !== null) tips.push(`MoM: ${view.momPct.toFixed(1)}%.`)
    if(view?.yoyPct !== null) tips.push(`YoY: ${view.yoyPct.toFixed(1)}%.`)
    const todo = actions.map(a => `• [${a.priority}] ${a.title} (uplift atteso ${a.expected_uplift_pct}%)`)
    return {tips, todo}
  }, [rawRes, actions, kpi, view])

  // Utils: dataURL per logo
  const fetchDataURL = async (path) => {
    const res = await fetch(path)
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
  }

  // PDF con header brand
  const exportPDF = async()=>{
    if(!reportRef.current) return
    const doc = new jsPDF({ unit:'px', format:'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()

    doc.setFillColor(BRAND.color)
    doc.rect(0, 0, pageWidth, 56, 'F')

    try {
      const logoData = await fetchDataURL(BRAND.logoPath)
      doc.addImage(logoData, 'SVG', 18, 12, 32, 32)
    } catch {}
    doc.setTextColor('#ffffff')
    doc.setFontSize(18)
    doc.text(`${BRAND.name} — Report`, 60, 32)
    doc.setFontSize(11)
    doc.text(`Generato: ${new Date().toLocaleString('it-IT')}`, 60, 46)

    const canvas = await html2canvas(reportRef.current, {scale: 2})
    const imgData = canvas.toDataURL('image/png')
    const margin = 20
    const usable = pageWidth - margin*2
    const ratio = usable / canvas.width
    const imgHeight = canvas.height * ratio
    doc.addImage(imgData, 'PNG', margin, 64, usable, imgHeight)

    doc.save('DataPredictor_Report.pdf')
  }

  return (
    <>
      <Head><title>{BRAND.name}</title></Head>
      <main className="container">
        <h1>{BRAND.name}</h1>

        <section className="toolbar">
          <input ref={fileRef} type="file" accept=".csv,.xlsx" onChange={()=>setError('')} />
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

        <section ref={reportRef}>
          {rawRes && (
            <>
              <section className="kpis">
                <div className="card"><div className="kpi-title">Ricavi 30gg</div><div className="kpi-value">€ {kpi.revenue_30d?.toLocaleString?.('it-IT') ?? kpi.revenue_30d}</div></div>
                <div className="card"><div className="kpi-title">Giorni con vendite</div><div className="kpi-value">{kpi.orders_days_positive_30d}</div></div>
                <div className="card"><div className="kpi-title">Ticket medio</div><div className="kpi-value">€ {kpi.avg_ticket?.toFixed?.(2) ?? kpi.avg_ticket}</div></div>
                <div className="card">
                  <div className="kpi-title">Trend 2w vs 2w</div>
                  <div className={`kpi-value ${kpi.trend_last_2w_vs_prev_2w_pct >= 0 ? 'pos' : 'neg'}`}>{kpi.trend_last_2w_vs_prev_2w_pct}%</div>
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
                <h3>Advisor</h3>
                <ul>{(advisor?.tips||[]).map((t,i)=><li key={i}>{t}</li>)}</ul>
                <h4>To-do operativo</h4>
                <pre className="box">{(advisor?.todo||[]).join('\n')}</pre>
              </section>

              <section className="actions">
                <h3>Azioni consigliate</h3>
                {(!rawRes.actions || rawRes.actions.length===0) && <p>Nessuna azione specifica.</p>}
                <ol>
                  {(actions||[]).map((a,i)=>(<li key={i}><b>{a.title}</b> — impatto atteso {a.expected_uplift_pct}% — priorità {a.priority}</li>))}
                </ol>
              </section>
            </>
          )}
        </section>

        {rawRes && (
          <details>
            <summary>Vedi JSON</summary>
            <pre className="box">{JSON.stringify(rawRes,null,2)}</pre>
          </details>
        )}
      </main>

      <style jsx>{`
        .container { padding:24px; max-width:1000px; margin:0 auto; font-family:system-ui,-apple-system,Segoe UI,Roboto }
        h1 { margin: 12px 0 8px }
        .toolbar { display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px }
        .period { margin-left:16px; display:flex; gap:8px; align-items:center }
        button { margin-left:12px; padding:8px 14px; background: var(--brand); color:#fff; border:0; border-radius:6px; cursor:pointer }
        button:disabled { opacity:.6; cursor:default }
        .link { margin-left:16px; color: var(--brand); text-decoration:none }
        .error { color: var(--error); margin-top:8px; }

        .kpis { display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; margin: 16px 0; }
        .card { padding:14px; border:1px solid var(--border); border-radius:10px; background: var(--card-bg); }
        .kpi-title { color: var(--muted); font-size:13px; }
        .kpi-value { font-size:20px; font-weight:600; margin-top:6px; }
        .kpi-value.pos { color:#059669; } .kpi-value.neg { color:#dc2626; }

        .diff { display:flex; gap:16px; flex-wrap:wrap; margin:8px 0; color: var(--text) }

        .chart-box { position:relative; height:320px; border:1px solid var(--border); border-radius:10px; padding:8px; background: var(--card-bg); }
        .box { background: var(--code-bg); color: var(--code-fg); padding:12px; border-radius:8px; overflow:auto; margin-top:10px }
      `}</style>
    </>
  )
}
