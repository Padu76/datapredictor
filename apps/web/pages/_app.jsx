import { useEffect, useState } from 'react'
import Head from 'next/head'
import '../styles/globals.css'
import { supabase } from '../lib/supabaseClient'

export default function MyApp({ Component, pageProps }){
  const [authMsg, setAuthMsg] = useState('')

  useEffect(()=>{
    // Se arriviamo con #access_token=..., lascia elaborare a supabase
    // e poi pulisci la URL.
    const hashHasTokens = typeof window !== 'undefined' && window.location.hash && window.location.hash.includes('access_token')
    if (hashHasTokens) {
      // Supabase intercetta l'hash automaticamente al load.
      // Diamo un attimo di tempo e poi puliamo l'URL.
      const t = setTimeout(()=>{
        try {
          const cleanUrl = window.location.origin + window.location.pathname + window.location.search
          window.history.replaceState({}, '', cleanUrl)
          setAuthMsg('Login effettuato con successo ✅')
        } catch {}
      }, 500)
      return () => clearTimeout(t)
    }
  }, [])

  // (Opzionale) ascolta i cambi di stato auth: SIGNED_IN, SIGNED_OUT…
  useEffect(()=>{
    if(!supabase) return
    const { data: sub } = supabase.auth.onAuthStateChange((event, session)=>{
      if(event === 'SIGNED_IN') setAuthMsg('Login effettuato con successo ✅')
      if(event === 'SIGNED_OUT') setAuthMsg('Sei uscito dall’account')
    })
    return () => sub?.subscription?.unsubscribe()
  }, [])

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="manifest" href="/manifest.json" />
        <title>DataPredictor</title>
      </Head>
      {authMsg && (
        <div style={{background:'#ecfdf5', color:'#065f46', padding:'8px 12px', fontSize:14}}>
          {authMsg}
        </div>
      )}
      <Component {...pageProps} />
    </>
  )
}
