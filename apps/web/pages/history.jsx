import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '../lib/supabaseClient'

export default function History(){
  const [rows,setRows]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  useEffect(()=>{
    const load=async()=>{
      if(!supabase){ setError('Supabase non configurato'); setLoading(false); return }
      try{
        let { data, error } = await supabase
          .from('analyses')
          .select('id, created_at, kpi')
          .order('created_at',{ascending:false})
          .limit(50)
        if(error) throw error
        setRows(data||[])
      }catch(e){ setError(e.message) }
      finally{ setLoading(false) }
    }
    load()
  },[])

  return (
    <>
      <Head><title>Storico Analisi - DataPredictor</title></Head>
      <main style={{padding:'24px', maxWidth:1000, margin:'0 auto', fontFamily:'system-ui'}}>
        <h1>Storico Analisi</h1>
        <Link href="/" style={{color:'#0ea5e9'}}>← Torna alla Home</Link>

        {loading && <p>Caricamento...</p>}
        {error && <p style={{color:'#b00020'}}>{error}</p>}
        {!loading && rows.length===0 && <p>Nessuna analisi salvata.</p>}

        {rows.length>0 && (
          <table style={{width:'100%', marginTop:16, borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'#f3f4f6', textAlign:'left'}}>
                <th style={{padding:8, borderBottom:'1px solid #e5e7eb'}}>Data</th>
                <th style={{padding:8, borderBottom:'1px solid #e5e7eb'}}>Ricavi 30gg</th>
                <th style={{padding:8, borderBottom:'1px solid #e5e7eb'}}>Ticket medio</th>
                <th style={{padding:8, borderBottom:'1px solid #e5e7eb'}}>Trend %</th>
                <th style={{padding:8, borderBottom:'1px solid #e5e7eb'}}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.id} style={{borderBottom:'1px solid #e5e7eb'}}>
                  <td style={{padding:8}}>{new Date(r.created_at).toLocaleString('it-IT')}</td>
                  <td style={{padding:8}}>€ {r.kpi?.revenue_30d}</td>
                  <td style={{padding:8}}>€ {r.kpi?.avg_ticket}</td>
                  <td style={{padding:8}}>{r.kpi?.trend_last_2w_vs_prev_2w_pct}%</td>
                  <td style={{padding:8}}>
                    <Link href={`/?analysisId=${r.id}`} style={{color:'#0ea5e9'}}>Apri</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  )
}
