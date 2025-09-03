import { useEffect, useState } from 'react'
import Head from 'next/head'
import '../styles/globals.css'
import { supabase } from '../lib/supabaseClient'

export default function MyApp({ Component, pageProps }){
  const [authMsg, setAuthMsg] = useState('')
  const [userEmail, setUserEmail] = useState(null)

  // Pulisce l’hash dei token quando arrivi dal magic link
  useEffect(()=>{
    const hasTokens = typeof window !== 'undefined' && window.location.hash?.includes('access_token')
    if (hasTokens) {
      const t = setTimeout(()=>{
        try {
          const clean = window.location.origin + window.location.pathname + window.location.search
          window.history.replaceState({}, '', clean)
          setAuthMsg('Login effettuato con successo ✅')
        } catch {}
      }, 500)
      return () => clearTimeout(t)
    }
  }, [])

  // Recupera sessione iniziale + ascolta cambi auth
  useEffect(()=>{
    if(!supabase) return
    ;(async ()=>{
      const { data } = await supabase.auth.getSession()
      setUserEmail(data?.session?.user?.email || null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((event, session)=>{
      if(event === 'SIGNED_IN'){ setAuthMsg('Login effettuato con successo ✅'); setUserEmail(session?.user?.email||null) }
      if(event === 'SIGNED_OUT'){ setAuthMsg('Sei uscito dall’account'); setUserEmail(null) }
    })
    return () => sub?.subscription?.unsubscribe()
  }, [])

  const logout = async ()=>{
    if(!supabase) return
    await supabase.auth.signOut()
  }

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="manifest" href="/manifest.json" />
        <title>DataPredictor</title>
      </Head>

      {/* Top bar: badge login + messaggi */}
      <div style={{background:'#f8fafc', borderBottom:'1px solid #e5e7eb', padding:'8px 12px', display:'flex', gap:12, alignItems:'center', fontSize:14}}>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <img src="/logo.svg" alt="Logo" width={20} height={20} />
          <b>DataPredictor</b>
        </div>
        <div style={{marginLeft:'auto', display:'flex', gap:12, alignItems:'center'}}>
          {userEmail ? (
            <>
              <span style={{padding:'2px 8px', background:'#ecfdf5', color:'#065f46', borderRadius:999}}>loggato: {userEmail}</span>
              <button onClick={logout} style={{padding:'6px 10px', background:'#ef4444', color:'#fff', border:0, borderRadius:6, cursor:'pointer'}}>Logout</button>
            </>
          ) : (
            <span style={{color:'#64748b'}}>non autenticato</span>
          )}
        </div>
      </div>

      {authMsg && (
        <div style={{background:'#ecfdf5', color:'#065f46', padding:'8px 12px', fontSize:14}}>
          {authMsg}
        </div>
      )}

      <Component {...pageProps} />
    </>
  )
}
