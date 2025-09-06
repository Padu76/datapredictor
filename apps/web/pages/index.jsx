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
  const [mode,setMode]=useState('business') // 'business' | 'finance'
  const [rfPct,setRfPct]=useState(0)        // risk-free annuo (solo finanza)
  const [rawRes,setRawRes]=useState(null)
  const [period,setPeriod]=useState('30')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [advisorLoading,setAdvisorLoading]=useState(false)
  const [advisorData,setAdvisorData]=useState(null)
  const [mappingOpen,setMappingOpen]=useState(false)
  const [headers,setHeaders]=useState([])
  const [mapping,setMapping]=useState({
    // business
    date:"", amount:"", price:"", qty:"",
    // finance (opzionali, uno dei due insiemi)
    close:"", symbol:"",
    options:{ date_format:"", decimal:"," }
  })

  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  const reportRef = useRef(null)

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
  const api = axios.create({ baseURL: apiBase })

  // Carica analisi da storico
  useEffect(()=>{
    const { analysisId } = router.query || {}
    if(!analysisId || !supabase) return
    ;(async ()=>{
      try{
        setLoading(true); setError('')
        const { data, error } = await supabase.from('analyses').select('*').eq('id', analysisId).single()
        if(error) throw error
        setRawRes({
          mode: data.kpi?.mode || 'business',
          kpi: data.kpi || {}, forecast: data.forecast || {},
          anomalies: data.anomalies || [], actions: data.actions || [],
          timeseries: data.timeseries || null
        })
        setTimeout(()=>document.getElementById('analyze')?.scrollIntoView({behavior:'smooth'}), 200)
      }catch(e){ setError(e.message || 'Errore caricamento analisi salvata') }
      finally{ setLoading(false) }
    })()
  }, [router.query])

  // Lettura header CSV/XLSX
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
    } else { setHeaders([]) }
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
      // business
      date: m.date || suggest(['date','data','order date','created_at']),
      amount: m.amount || suggest(['amount','revenue','ricavo','total','totale','valore']),
      price: m.price || suggest(['price','prezzo','unit_price']),
      qty: m.qty || suggest(['qty','quantita','quantity','qta']),
      // finance
      close: m.close || suggest(['close','adj close','close price']),
      symbol: m.symbol || suggest(['symbol','ticker','asset'])
    }))
    setMappingOpen(true)
  }

  const onAnalyze = async()=>{
    setError(''); setAdvisorData(null)
    const f = fileRef.current?.files?.[0] || null
    if(!f){ setError('Seleziona un file'); return }
    document.getElementById('analyze')?.scrollIntoView({behavior:'smooth'})
    setLoading(true)
    try{
      const form=new FormData()
      form.append('file', f)
      const m = {...mapping}
      form.append('mapping', JSON.stringify(m))
      form.append('mode', mode)
      form.append('rf_pct_annual', String(rfPct||0))
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

  // View slice + MoM/YoY (solo business)
  const view = useMemo(()=>{
    if(!rawRes?.timeseries || mode!=='business') return null
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
  }, [rawRes, period, mode])

  // Chart (business: ricavi; finanza: prezzo/valore)
  useEffect(()=>{
    if(!rawRes?.timeseries || !canvasRef.current) return
    const labels = rawRes.timeseries.map(p => p.date)
    const values = rawRes.timeseries.map(p => p.value)
    if(chartRef.current){ chartRef.current.destroy() }
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: { labels, datasets: [{ label: mode==='finance' ? 'Prezzo/Valore' : 'Ricavi giornalieri', data: values }] },
      options: { responsive: true, maintainAspectRatio: false, plugins:{ legend:{display:false}},
        scales:{ x:{ ticks:{ maxRotation:0, autoSkip:true, maxTicksLimit:8 }}, y:{ beginAtZero: mode!=='finance' } } }
    })
  }, [rawRes, mode])

  // Advisor
  const generateAdvisor = async()=>{
    if(!rawRes){ setError('Esegui prima un’analisi.'); return }
    setAdvisorLoading(true); setError('')
    try{
      const ctx = { period, mode, mom_pct: view?.momPct ?? null, yoy_pct: view?.yoyPct ?? null, rf_pct: rfPct }
      const r = await axios.post(`${apiBase}/advisor`, { analysis: rawRes, context: ctx })
      setAdvisorData(r.data)
    }catch(e){ setError(e?.response?.data?.detail || e.message || 'Errore generazione advisor') }
    finally{ setAdvisorLoading(false) }
  }

  // PDF brand
  const fetchDataURL = async (path) => {
    const res = await fetch(path); const blob = await res.blob()
    return await new Promise((resolve) => { const rd = new FileReader(); rd.onload=()=>resolve(rd.result); rd.readAsDataURL(blob) })
  }
  const exportPDF = async()=>{
    if(!reportRef.current) return
    const doc = new jsPDF({ unit:'px', format:'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    doc.setFillColor('#0ea5e9'); doc.rect(0, 0, pageWidth, 56, 'F')
    try { const logoData = await fetchDataURL(BRAND.logoPath); doc.addImage(logoData, 'SVG', 18, 12, 32, 32) } catch {}
    doc.setTextColor('#ffffff'); doc.setFontSize(18); doc.text(`${BRAND.name} — Report`, 60, 32)
    doc.setFontSize(11); doc.text(`Generato: ${new Date().toLocaleString('it-IT')}`, 60, 46)
    const canvas = await html2canvas(reportRef.current, {scale: 2})
    const imgData = canvas.toDataURL('image/png'); const margin = 20
    const usable = pageWidth - margin*2; const ratio = usable / canvas.width
    doc.addImage(imgData, 'PNG', margin, 64, usable, canvas.height * ratio)
    doc.save('DataPredictor_Report.pdf')
  }

  // === UI ===
  const [showFinanceOpts, setShowFinanceOpts] = useState(false)
  useEffect(()=>{ setShowFinanceOpts(mode==='finance') }, [mode])

  return (
    <>
      <Head><title>{BRAND.name}</title></Head>

      {/* HERO/landing rimane come nel tuo ultimo styling (non lo ripeto qui per brevità) */}

      {/* ANALYZE */}
      <main className="container" id="analyze" style={{paddingTop:24, paddingBottom:40}}>
        <h2>Analizza ora</h2>

        {/* MODE SWITCH */}
        <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', margin:'8px 0 4px'}}>
          <span className="muted">Tipo analisi:</span>
          <button className={mode==='business'?'primary':'ghost'} onClick={()=>setMode('business')}>Business</button>
          <button className={mode==='finance'?'primary':'ghost'} onClick={()=>setMode('finance')}>Finanza</button>
          {mode==='finance' && (
            <>
              <span className="muted" style={{marginLeft:10}}>Risk-free annuo (%)</span>
              <input type="number" step="0.1" value={rfPct} onChange={e=>setRfPct(Number(e.target.value||0))} style={{width:90}} />
            </>
          )}
        </div>

        <section className="toolbar">
          <input ref={fileRef} type="file" accept=".csv,.xlsx" onChange={()=>{ setError(''); setHeaders([]); }} />
          <button className="ghost" onClick={openMapping}>Mappa colonne</button>
          <button className="primary" onClick={onAnalyze} disabled={loading}>{loading?'Analisi...':'Analizza'}</button>

          {mode==='business' && (
            <div className="period">
              <label>Periodo:</label>
              <select value={period} onChange={e=>setPeriod(e.target.value)}>
                {PERIODS.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
          )}

          <button className="ghost" onClick={exportPDF} disabled={!rawRes}>Esporta PDF</button>
          <Link href="/history" className="link">Storico Analisi</Link>
        </section>
        {error && <p className="error">{error}</p>}

        {/* Wizard mappatura */}
        {mappingOpen && (
          <div className="modal">
            <div className="modal-card">
              <h3 style={{marginTop:0}}>Mappatura colonne ({mode})</h3>

              {/* BUSINESS mapping */}
              {mode==='business' && (
                <>
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
                            <option value="">-- (oppure Prezzo×Qty) --</option>
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
