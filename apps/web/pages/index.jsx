import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import Head from 'next/head'
import Chart from 'chart.js/auto'

export default function Home(){
  const [file,setFile]=useState(null)
  const [res,setRes]=useState(null)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000' })

  const onAnalyze = async()=>{
    setError('')
    if(!file){ setError('Seleziona un CSV'); return }
    setLoading(true)
    try{
      const form=new FormData()
      form.append('file', file)
      const r=await api.post('/analyze', form, {headers:{'Content-Type':'multipart/form-data'}})
      setRes(r.data)
    }catch(e){
      setError(e?.response?.data?.detail || e.message)
    }finally{ setLoading(false) }
  }

  useEffect(()=>{
    if(!res?.timeseries || !canvasRef.current) return
    const labels = res.timeseries.map(p => p.date)
    const values = res.timeseries.map(p => p.value)
    if(chartRef.current){ chartRef.current.destroy() }
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Ricavi giornalieri', data: values }] },
      options: {
        responsive: true, maintainAspectRatio: false, plugins:{ legend:{display:false}},
        scales:{ x:{ ticks:{ maxRotation:0, autoSkip:true, maxTicksLimit:8 }}, y:{ beginAtZero:true } }
      }
    })
  }, [res])

  const kpi = res?.kpi || {}
  const actions = res?.actions || []

  return (
    <>
      <Head><title>DataPredictor</title></Head>
      <main className='container'>
        <h1>DataPredictor</h1>
        <section className='uploader'>
          <input type='file' accept='.csv' onChange={e=>setFile(e.target.files?.[0]||null)} />
          <button onClick={onAnalyze} disabled={loading}>{loading?'Analisi...':'Analizza'}</button>
          {error && <p style={{color:'#b00020'}}>{error}</p>}
        </section>

        {res && (<>
          <section className='kpis' style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:12,margin:'16px 0'}}>
            <div className='card' style={{padding:14,border:'1px solid #e5e7eb',borderRadius:10,background:'#fff'}}>
              <div style={{color:'#6b7280',fontSize:13}}>Ricavi 30gg</div>
              <div style={{fontSize:20,fontWeight:600,marginTop:6}}>€ {kpi.revenue_30d?.toLocaleString?.('it-IT') ?? kpi.revenue_30d}</div>
            </div>
            <div className='card' style={{padding:14,border:'1px solid #e5e7eb',borderRadius:10,background:'#fff'}}>
              <div style={{color:'#6b7280',fontSize:13}}>Giorni con vendite</div>
              <div style={{fontSize:20,fontWeight:600,marginTop:6}}>{kpi.orders_days_positive_30d}</div>
            </div>
            <div className='card' style={{padding:14,border:'1px solid #e5e7eb',borderRadius:10,background:'#fff'}}>
              <div style={{color:'#6b7280',fontSize:13}}>Ticket medio</div>
              <div style={{fontSize:20,fontWeight:600,marginTop:6}}>€ {kpi.avg_ticket?.toFixed?.(2) ?? kpi.avg_ticket}</div>
            </div>
            <div className='card' style={{padding:14,border:'1px solid #e5e7eb',borderRadius:10,background:'#fff'}}>
              <div style={{color:'#6b7280',fontSize:13}}>Trend 2w vs 2w</div>
              <div style={{fontSize:20,fontWeight:600,marginTop:6, color:(kpi.trend_last_2w_vs_prev_2w_pct>=0?'#059669':'#dc2626')}}>
                {kpi.trend_last_2w_vs_prev_2w_pct}%
              </div>
            </div>
          </section>

          <section className='chart-wrap'>
            <h3>Ricavi giornalieri</h3>
            <div style={{position:'relative',height:320,border:'1px solid #e5e7eb',borderRadius:10,padding:8,background:'#fff'}}>
              <canvas ref={canvasRef} />
            </div>
          </section>

          <section className='actions' style={{marginTop:20}}>
            <h3>Azioni consigliate</h3>
            {actions.length===0 && <p>Nessuna azione specifica.</p>}
            <ol>
              {actions.map((a,i)=>(
                <li key={i}><b>{a.title}</b> — impatto atteso {a.expected_uplift_pct}% — priorità {a.priority}</li>
              ))}
            </ol>
          </section>

          <details>
            <summary>Vedi JSON</summary>
            <pre className='box'>{JSON.stringify(res,null,2)}</pre>
          </details>
        </>)}
      </main>
    </>
  )
}
