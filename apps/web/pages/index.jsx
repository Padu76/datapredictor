import { useState, useEffect, useRef, useMemo } from 'react'
import axios from 'axios'
import Head from 'next/head'
import Chart from 'chart.js/auto'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { supabase } from '../lib/supabaseClient'

const PERIODS = [
  {key:'7',  label:'7 giorni'},
  {key:'30', label:'30 giorni'},
  {key:'90', label:'90 giorni'},
]

export default function Home(){
  const [file,setFile]=useState(null)
  const [rawRes,setRawRes]=useState(null)   // risposta grezza
  const [period,setPeriod]=useState('30')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  const reportRef = useRef(null) // per PDF

  const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000' })

  const onAnalyze = async()=>{
    setError('')
    if(!file){ setError('Seleziona un file CSV/XLSX'); return }
    setLoading(true)
    try{
      const form=new FormData()
      form.append('file', file)
      const r=await api.post('/analyze', form, {headers:{'Content-Type':'multipart/form-data'}})
      setRawRes(r.data)

      // salva opzionale su Supabase se configurato
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
      setError(e?.response?.data?.detail || e.message)
    }finally{ setLoading(false) }
  }

  // Timeseries filtrata per periodo e calcoli YoY/MoM
  const view = useMemo(()=>{
    if(!rawRes?.timeseries) return null
    const ts = rawRes.timeseries.map(p => ({...p, d: new Date(p.date)}))
    if(ts.length===0) return null

    const end = ts[ts.length-1].d
    const days = parseInt(period,10)
    const start = new Date(end); start.setDate(end.getDate()- (days-1))
    const current = ts.filter(p => p.d >= start)

    // Serie confronto
    const prevMonthStart = new Date(start); prevMonthStart.setMonth(prevMonthStart.getMonth()-1)
    const prevMonthEnd   = new Date(end);   prevMonthEnd.setMonth(prevMonthEnd.getMonth()-1)
    const prevYearStart  = new Date(start); prevYearStart.setFullYear(prevYearStart.getFullYear()-1)
    const prevYearEnd    = new Date(end);   prevYearEnd.setFullYear(prevYearEnd.getFullYear()-1)

    const inRange = (p, a, b) => p.d >= a && p.d <= b
    const seriesMoM = ts.filter(p => inRange(p, prevMonthStart, prevMonthEnd))
    const seriesYoY = ts.filter(p => inRange(p, prevYearStart,  prevYearEnd))

    const sum = arr => arr.reduce((s,x)=>s + (x?.value||0), 0)
    const revenue = sum(current)
    const mom      = sum(seriesMoM)
    const yoy      = sum(seriesYoY)
    const momPct = mom ? ((revenue-mom)/mom*100) : null
    const yoyPct = yoy ? ((revenue-yoy)/yoy*100) : null

    return { current, revenue, momPct, yoyPct, end }
  }, [rawRes, period])

  // Disegna/aggiorna grafico
  useEffect(()=>{
    if(!view?.current || !canvasRef.current) return
    const labels = view.current.map(p => p.date)
    const values = view.current.map(p => p.value)
    if(chartRef.current){ chartRef.current.destroy() }
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Ricavi giornalieri', data: values }] },
      options: {
        responsive: true, maintainAspectRatio: false, plugins:{ legend:{display:false}},
        scales:{ x:{ ticks:{ maxRotation:0, autoSkip:true, maxTicksLimit:8 }}, y:{ beginAtZero:true } }
      }
    })
  }, [view])

  const kpi = rawRes?.kpi || {}
  const actions = rawRes?.actions || []

  // Advisor testuale
  const advisor = useMemo(()=>{
    if(!rawRes) return null
    const tips = []
    const trend = kpi.trend_last_2w_vs_prev_2w_pct ?? 0
    const forecastChange = rawRes?.forecast?.change_vs_last30_pct ?? 0
    const anomalies = rawRes?.anomalies || []

    if(trend > 10) {
      tips.push("Trend forte in crescita: aumenta budget sulle sorgenti top e scala le creatività vincenti.")
    } else if (trend < -5) {
      tips.push("Trend in calo: rivedi offerte/pricing e attiva una promo tattica 7 giorni.")
    } else {
      tips.push("Trend stabile: consolida i best seller e testa piccole varianti di prezzo/pacchetti.")
    }

    if(forecastChange < 0) {
      tips.push("Forecast sotto gli ultimi 30 gg: ribilancia stock e spingi campagne sui prodotti ad alta conversione.")
    } else {
      tips.push("Forecast sopra gli ultimi 30 gg: prepara scorte e customer care per sostenere il volume.")
    }

    if(anomalies.length>0){
      tips.push(`Rilevate anomalie in ${anomalies.length} giorni: controlla prezzi, resi, interruzioni ads.`)
    }

    if(view?.momPct !== null){
      tips.push(`MoM: ${view.momPct.toFixed(1)}%.`)
    }
    if(view?.yoyPct !== null){
      tips.push(`YoY: ${view.yoyPct.toFixed(1)}%.`)
    }

    const todo = actions.map(a => `• [${a.priority}] ${a.title} (uplift atteso ${a.expected_uplift_pct}%)`)
    return {tips, todo}
  }, [rawRes, actions, kpi, view])

  // Export PDF
  const exportPDF = async()=>{
    if(!reportRef.current) return
    const doc = new jsPDF({ unit:'px', format:'a4' })
    const scale = 2

    // titolo / branding
    doc.setFontSize(18)
    doc.text('DataPredictor — Report', 24, 32)
    doc.setFontSize(11)
    doc.text(`Generato: ${new Date().toLocaleString('it-IT')}`, 24, 48)

    // snapshot sezione report
    const canvas = await html2canvas(reportRef.current, {scale})
    const imgData = canvas.toDataURL('image/png')
    const pageWidth = doc.internal.pageSize.getWidth() - 40
    const ratio = pageWidth / canvas.width
    const imgHeight = canvas.height * ratio
    doc.addImage(imgData, 'PNG', 20, 64, pageWidth, imgHeight)

    doc.save('DataPredictor_Report.pdf')
  }

  // Auth (solo se Supabase configurato)
  const signIn = async(email)=>{
    if(!supabase) return alert('Supabase non configurato')
    const { error } = await supabase.auth.signInWithOtp({ email })
    if(error) alert(error.message); else alert('Email inviata. Controlla la posta.')
  }

  return (
    <>
      <Head><title>DataPredictor</title></Head>
      <main className="container">
        <h1>DataPredictor</h1>

        {/* Upload + Periodo + PDF */}
        <section className="toolbar" style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap', marginBottom:12}}>
          <input type="file" accept=".csv,.xlsx" onChange={e=>setFile(e.target.files?.[0]||null)} />
          <button onClick={onAnalyze} disabled={loading}>{loading?'Analisi...':'Analizza'}</button>

          <div style={{marginLeft:16}}>
            <label style={{marginRight:8}}>Periodo:</label>
            <select value={period} onChange={e=>setPeriod(e.target.value)}>
              {PERIODS.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>

          <button onClick={exportPDF} disabled={!rawRes}>Esporta PDF</button>

          {/* Auth (opzionale) */}
          {!supabase ? null : (
            <div style={{marginLeft:'auto'}}>
              <input type="email" placeholder="email per login" id="emailbox" />
              <button onClick={()=>signIn(document.getElementById('emailbox').value)}>Login link</button>
            </div>
          )}
        </section>
        {error && <p style={{color:'#b00020'}}>{error}</p>}

        {/* Report container per PDF */}
        <section ref={reportRef}>
          {rawRes && (
            <>
              {/* KPI */}
              <section className="kpis" style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:12,margin:'16px 0'}}>
                <div className="card"><div className="kpi-title">Ricavi 30gg</div><div className="kpi-value">€ {kpi.revenue_30d?.toLocaleString?.('it-IT') ?? kpi.revenue_30d}</div></div>
                <div className="card"><div className="kpi-title">Giorni con vendite</div><div className="kpi-value">{kpi.orders_days_positive_30d}</div></div>
                <div className="card"><div className="kpi-title">Ticket medio</div><div className="kpi-value">€ {kpi.avg_ticket?.toFixed?.(2) ?? kpi.avg_ticket}</div></div>
                <div className="card">
                  <div className="kpi-title">Trend 2w vs 2w</div>
                  <div className={`kpi-value ${kpi.trend_last_2w_vs_prev_2w_pct >= 0 ? 'pos' : 'neg'}`}>{kpi.trend_last_2w_vs_prev_2w_pct}%</div>
                </div>
              </section>

              {/* Add-on YoY/MoM */}
              <section style={{display:'flex',gap:16,flexWrap:'wrap',margin:'8px 0'}}>
                <span>MoM: {view?.momPct===null ? 'n/d' : `${view.momPct.toFixed(1)}%`}</span>
                <span>YoY: {view?.yoyPct===null ? 'n/d' : `${view.yoyPct.toFixed(1)}%`}</span>
              </section>

              {/* Chart */}
              <section className="chart-wrap">
                <h3>Ricavi giornalieri</h3>
                <div className="chart-box"><canvas ref={canvasRef} /></div>
              </section>

              {/* Advisor */}
              <section className="advisor">
                <h3>Advisor</h3>
                <ul>{advisor?.tips?.map((t,i)=><li key={i}>{t}</li>)}</ul>
                <h4>To-do operativo</h4>
                <pre className="box">{(advisor?.todo||[]).join('\n')}</pre>
              </section>

              {/* Azioni consigliate (dal backend) */}
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

        {/* JSON raw opzionale */}
        {rawRes && (
          <details>
            <summary>Vedi JSON</summary>
            <pre className="box">{JSON.stringify(rawRes,null,2)}</pre>
          </details>
        )}
      </main>

      <style jsx>{`
        .container { padding:24px; max-width:1000px; margin:0 auto; font-family:system-ui,-apple-system,Segoe UI,Roboto }
        button { margin-left:12px; padding:8px 14px; background:#0ea5e9; color:#fff; border:0; border-radius:6px; cursor:pointer }
        button:disabled { opacity:.6; cursor:default }
        .kpis .card { padding:14px; border:1px solid #e5e7eb; border-radius:10px; background:#fff }
        .kpi-title { color:#6b7280; font-size:13px; }
        .kpi-value { font-size:20px; font-weight:600; margin-top:6px; }
        .kpi-value.pos { color:#059669; } .kpi-value.neg { color:#dc2626; }
        .chart-box { position:relative; height:320px; border:1px solid #e5e7eb; border-radius:10px; padding:8px; background:#fff; }
        .box { background:#f7f7f7; padding:12px; border-radius:8px; overflow:auto; margin-top:10px }
        .advisor ul { margin: 8px 0; }
      `}</style>
    </>
  )
}
