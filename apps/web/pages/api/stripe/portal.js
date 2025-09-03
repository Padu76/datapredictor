// apps/web/pages/api/stripe/portal.js
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { userId } = req.body
    if (!userId) return res.status(400).json({ error: 'userId richiesto' })
    const { data: prof, error } = await supabase.from('profiles').select('stripe_customer_id').eq('id', userId).single()
    if (error || !prof?.stripe_customer_id) return res.status(400).json({ error: 'customer non trovato' })
    const portal = await stripe.billingPortal.sessions.create({
      customer: prof.stripe_customer_id,
      return_url: `${req.headers.origin}/pricing`
    })
    return res.status(200).json({ url: portal.url })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'portal error' })
  }
}
