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
  const [advisorLoading,setAdvisorLoading]=useState(false)
  const [advisorData,setAdvisorData]=useState(null) // {mode, advisor_text, playbook}
  const [whatIf,setWhatIf]=useState({ priceDelta: 0, elasticity: -1.5, cogsPct: 40 })
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
      }catch(e){
        setError(e.message || 'Errore caricamento analisi salvata')
      }finally{ setLoading(false) }
    })()
  }, [router.query])

  const onAnalyze = async()=>{
    setError('')
    setAdvisorData(null)
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
          kpi: r.data.kpi, forecast: r.data.forecast,
          anomalies: r.data.anomalies, actions: r.data.actions,
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

  // Advisor (chiama /advisor – LLM se disponibile, altrimenti rule-based)
  const generateAdvisor = async()=>{
    if(!rawRes){ setError('Esegui prima un’analisi.'); return }
    setAdvisorLoading(true); setError('')
    try{
      const ctx = { period, mom_pct: view?.momPct ?? None, yoy_pct: view?.yoyPct ?? None }
      const r = await axios.post(`${apiBase}/advisor`, { analysis: rawRes, context: ctx })
      setAdvisorData(r.data)
    }catch(e){
      setError(e?.response?.data?.detail || e.message || 'Errore generazione advisor')
    }finally{ setAdvisorLoading(false) }
  }

  // What-if pricing (stima semplice)
  const whatIfResult = useMemo(()=>{
    if(!kpi?.revenue_30d || !kpi?.avg_ticket) return null
    const priceDelta = Number(whatIf.priceDelta) / 100     // % variazione prezzo
    const elasticity = Number(whatIf.elasticity)           # negative typical
    const cogs = Number(whatIf.cogsPct) / 100

    const baseRevenue = Number(kpi.revenue_30d)
    const baseAOV = Number(kpi.avg_ticket)
    const baseOrders = baseAOV > 0 ? baseRevenue / baseAOV : 0

    // volume multiplier con elasticità: Q' = Q * (1 + e * Δp)
    let volMult = 1 + (elasticity * priceDelta)
    if (volMult < 0) volMult = 0

    const newPriceMult = 1 + priceDelta
    const newAOV = baseAOV * newPriceMult
    const newOrders = baseOrders * volMult
    const newRevenue = newAOV * newOrders

    // margine: (1 - cogs) * ricavi (assunzione lineare)
    const baseMargin = baseRevenue * (1 - cogs)
    const newMargin = newRevenue * (1 - cogs)

    return {
      newAOV, newOrders, newRevenue, newMargin,
      deltaRevenuePct: baseRevenue ? ((newRevenue - baseRevenue)/baseRevenue*100) : 0,
      deltaMarginPct:  baseMargin ? ((newMargin - baseMargin)/baseMargin*100) : 0
    }
  }, [kpi, whatIf])

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

    doc.setFillColor(BRAND.color)
    doc.rect(0, 0, pageWidth, 56, 'F')

    try { const logoData = await fetchDataURL(BRAND.logoPath); doc.addImage(logoData, 'SVG', 18, 12, 32, 32) } catch {}
    doc.setTextColor('#ffffff')
    doc.setFontSize(18); doc.text(`${BRAND.name} — Report`, 60, 32)
    doc.setFontSize(11); doc.text(`Generato: ${new Date().toLocaleString('it-IT')}`, 60, 46)

    const canvas = await html2canvas(reportRef.current, {scale: 2})
    const imgData = canvas.toDataURL('image/png')
    const margin = 20, usable = pageWidth - margin*2
    const ratio = usable / canvas.width, imgHeight = canvas.height * ratio
    doc.addImage(imgData, 'PNG', margin, 64, usable, imgHeight)
    doc.save('DataPredictor_Report.pdf')
  }

  return (
    <>
      <Head><title>{BRAND.name}</title></Head>
      <main className="container">
        <h1>{BRAND.name}</h1>

        {/* Toolbar */}
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

        {/* Report area */}
        <section ref={reportRef}>
          {rawRes && (
            <>
              {/* KPI */}
              <section className="kpis">
                <div className="card"><div className="kpi-title">Ricavi 30gg</div><div className="kpi-value">€ {rawRes.kpi?.revenue_30d?.toLocaleString?.('it-IT') ?? rawRes.kpi?.revenue_30d}</div></div>
                <div className="card"><div className="kpi-title">Giorni con vendite</div><div className="kpi-value">{rawRes.kpi?.orders_days_positive_30d}</div></div>
                <div className="card"><div className="kpi-title">Ticket medio</div><div className="kpi-value">€ {rawRes.kpi?.avg_ticket?.toFixed?.(2) ?? rawRes.kpi?.avg_ticket}</div></div>
                <div className="card">
                  <div className="kpi-title">Trend 2w vs 2w</div>
                  <div className={`kpi-value ${rawRes.kpi?.trend_last_2w_vs_prev_2w_pct >= 0 ? 'pos' : 'neg'}`}>{rawRes.kpi?.trend_last_2w_vs_prev_2w_pct}%</div>
                </div>
              </section>

              {/* MoM / YoY */}
              <section className="diff">
                <span>MoM: {view?.momPct===null ? 'n/d' : `${view.momPct.toFixed(1)}%`}</span>
                <span>YoY: {view?.yoyPct===null ? 'n/d' : `${view.yoyPct.toFixed(1)}%`}</span>
              </section>

              {/* Chart */}
              <section className="chart-wrap">
                <h3>Ricavi giornalieri</h3>
                <div className="chart-box"><canvas ref={canvasRef} /></div>
              </section>

              {/* Advisor Pro */}
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

              {/* What-if Pricing */}
              <section className="whatif">
                <h3>What-if Pricing</h3>
                <div className="grid">
                  <div>
                    <label>Variazione prezzo (%)</label>
                    <input type="range" min="-20" max="20" step="1"
                      value={whatIf.priceDelta}
                      onChange={(e)=>setWhatIf({...whatIf, priceDelta: Number(e.target.value)})}/>
                    <div>{whatIf.priceDelta}%</div>
                  </div>
                  <div>
                    <label>Elasticità (negativa)</label>
                    <input type="number" step="0.1" value={whatIf.elasticity}
                      onChange={e=>setWhatIf({...whatIf, elasticity: Number(e.target.value)})}/>
                    <div className="muted">es. -1.5: +10% prezzo ⇒ -15% volumi</div>
                  </div>
                  <div>
                    <label>COGS %</label>
                    <input type="number" step="1" value={whatIf.cogsPct}
                      onChange={e=>setWhatIf({...whatIf, cogsPct: Number(e.target.value)})}/>
                    <div className="muted">costo del venduto sul prezzo</div>
                  </div>
                </div>

                {whatIfResult ? (
                  <div className="card" style={{marginTop:12}}>
                    <div><b>Nuovo AOV</b>: € {whatIfResult.newAOV.toFixed(2)}</div>
                    <div><b>Ordini stimati (30gg)</b>: {Math.round(whatIfResult.newOrders)}</div>
                    <div><b>Ricavi stimati (30gg)</b>: € {whatIfResult.newRevenue.toFixed(2)} ({whatIfResult.deltaRevenuePct.toFixed(1)}%)</div>
                    <div><b>Margine stimato (30gg)</b>: € {whatIfResult.newMargin.toFixed(2)} ({whatIfResult.deltaMarginPct.toFixed(1)}%)</div>
                    <div className="muted">Modello semplice: non considera vincoli di capacità, stagionalità o mix di prodotto.</div>
                  </div>
                ) : (
                  <p className="muted">Carica un file per attivare il simulatore (servono AOV e Ricavi 30gg).</p>
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

        .advisor h3, .whatif h3, .actions h3 { margin-top:20px }
        .grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; }
        .muted { color: var(--muted); }
        .box { background: var(--code-bg); color: var(--code-fg); padding:12px; border-radius:8px; overflow:auto; margin-top:10px }
      `}</style>
    </>
  )
}
