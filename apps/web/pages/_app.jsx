import { useEffect, useState } from 'react'
import Head from 'next/head'
import '../styles/globals.css'
import { supabase } from '../lib/supabaseClient'

const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'DataPredictor',
  color: process.env.NEXT_PUBLIC_BRAND_COLOR || '#0ea5e9',
  logo:  process.env.NEXT_PUBLIC_BRAND_LOGO  || '/logo.svg',
}

export default function MyApp({ Component, pageProps }){
  const [authMsg, setAuthMsg] = useState('')
  const [userEmail, setUserEmail] = useState(null)
  const [theme, setTheme] = useState('light') // 'light' | 'dark'

  // Inizializza tema da localStorage
  useEffect(()=>{
    const t = (typeof window !== 'undefined' && localStorage.getItem('dp_theme')) || 'light'
    setTheme(t)
    document.documentElement.setAttribute('data-theme', t)
  }, [])

  const toggleTheme = ()=>{
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    if (typeof window !== 'undefined') localStorage.setItem('dp_theme', next)
  }

  // Pulisce hash supabase al primo accesso
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

  // Sessione + badge email
  useEffect(()=>{
    if(!supabase) return
    ;(async ()=>{ const { data } = await supabase.auth.getSession(); setUserEmail(data?.session?.user?.email || null) })()
    const { data: sub } = supabase.auth.onAuthStateChange((event, session)=>{
      if(event === 'SIGNED_IN'){ setAuthMsg('Login effettuato con successo ✅'); setUserEmail(session?.user?.email||null) }
      if(event === 'SIGNED_OUT'){ setAuthMsg('Sei uscito dall’account'); setUserEmail(null) }
    })
    return () => sub?.subscription?.unsubscribe()
  }, [])

  const logout = async ()=>{ if(supabase) await supabase.auth.signOut() }

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="manifest" href="/manifest.json" />
        <title>{BRAND.name}</title>
      </Head>

      {/* Top bar brand + tema + badge login */}
      <div className="topbar">
        <div className="brand">
          <img src={BRAND.logo} alt="Logo" width={20} height={20} />
          <b>{BRAND.name}</b>
        </div>
        <div className="top-actions">
          <button className="btn-outline" onClick={toggleTheme}>{theme === 'light' ? '🌙 Dark' : '☀️ Light'}</button>
          {userEmail ? (
            <>
              <span className="badge-ok">loggato: {userEmail}</span>
              <button className="btn-danger" onClick={logout}>Logout</button>
            </>
          ) : (
            <span className="muted">non autenticato</span>
          )}
        </div>
      </div>

      {authMsg && (<div className="notice-ok">{authMsg}</div>)}

      {/* CSS variables brand */}
      <style jsx global>{`
        :root {
          --brand: ${BRAND.color};
        }
      `}</style>

      <Component {...pageProps} />
    </>
  )
}
