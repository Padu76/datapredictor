import { useState } from 'react'
import axios from 'axios'

export default function Home(){
  const [file,setFile]=useState(null)
  const [res,setRes]=useState(null)
  const [loading,setLoading]=useState(false)
  const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000' })

  const onAnalyze = async()=>{
    if(!file){ alert('Seleziona un CSV'); return }
    setLoading(true)
    try{
      const form=new FormData()
      form.append('file', file)
      const r=await api.post('/analyze', form, {headers:{'Content-Type':'multipart/form-data'}})
      setRes(r.data)
    }catch(e){
      alert(e?.response?.data?.detail || e.message)
    }finally{ setLoading(false) }
  }

  return (
    <main className="container">
      <h1>DataPredictor</h1>
      <p>Carica un <b>CSV</b> (colonna data + importo, oppure price+qty).</p>
      <input type="file" accept=".csv" onChange={e=>setFile(e.target.files?.[0]||null)} />
      <button onClick={onAnalyze} disabled={loading}>{loading?'Analisi...':'Analizza'}</button>
      {res && <pre className="box">{JSON.stringify(res,null,2)}</pre>}
    </main>
  )
}