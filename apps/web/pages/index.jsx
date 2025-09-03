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
import AdvisorPanel from '../components/AdvisorPanel' // ⬅️ NUOVO: usa il pannello elegante

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
    date:"", amount:"", price:"", qty:"",
    options:{ date_format:"", decimal:"," }
  })

  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  const reportRef = useRef(null)

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
  const api = axios.create({ baseURL: apiBase })

  // Se arrivo con ?analysisId, carico e scrollo all'analisi
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
        setTimeout(()=>document.getElementById('analyze')?.scrollIntoView({behavior:'smooth'}), 200)
      }catch(e){ setError(e.message || 'Errore caricamento analisi salvata') }
      finally{ setLoading(false) }
    })()
  }, [router.query])

  // Header from CSV/XLSX
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
      date: m.date || suggest(['date','data','order date','created_at']),
      amount: m.amount || suggest(['amount','revenue','ricavo','total','totale','valore']),
      price: m.price || suggest(['price','prezzo','unit_price']),
      qty: m.qty || suggest(['qty','quantita','quantity','qta'])
    }))
    setMappingOpen(true)
  }

  const onAnalyze = async()=>{
    setError(''); setAdvisorData(null)
    const f = fileRef.current?.files?.[0] || null
    if(!f){ setError('Seleziona un file CSV/XLSX'); return }
    document.getElementById('analyze')?.scrollIntoView({behavior:'smooth'})
    setLoading(true)
    try{
      const form=new FormData()
      form.append('file', f)
      const hasMapping = mapping?.date || mapping?.amount || (mapping?.price && mapping?.qty)
      if(hasMapping){ form.append('mapping', JSON.stringify(mapping)) }
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

  // View slice + MoM/YoY
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

  // Chart
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

  // Advisor
  const generateAdvisor = async()=>{
    if(!rawRes){ setError('Esegui prima un’analisi.'); return }
    setAdvisorLoading(true); setError('')
    try{
      const ctx = { period, mom_pct: view?.momPct ?? null, yoy_pct: view?.yoyPct ??
