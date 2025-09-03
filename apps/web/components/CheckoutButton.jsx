// apps/web/components/CheckoutButton.jsx
import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = typeof window !== 'undefined'
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  : null

export default function CheckoutButton({ priceId, className = '' }) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, userId: user.id, email: user.email })
      })
      const json = await res.json()
      if (json?.url) window.location.href = json.url
      else alert('Errore: non ho ricevuto l’URL di checkout.')
    } catch (e) {
      alert('Errore checkout: ' + (e?.message || 'sconosciuto'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`px-5 py-3 rounded-xl text-white font-semibold shadow ${className}`}
      style={{ backgroundColor: process.env.NEXT_PUBLIC_BRAND_COLOR || '#0ea5e9' }}
    >
      {loading ? 'Reindirizzo…' : 'Acquista'}
    </button>
  )
}
