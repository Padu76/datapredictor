// apps/web/pages/api/stripe/create-checkout-session.js
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { priceId, userId, email } = req.body
    if (!priceId || !userId || !email) return res.status(400).json({ error: 'priceId, userId, email richiesti' })

    // recupera/crea customer
    let customerId
    const { data: prof } = await supabase.from('profiles').select('stripe_customer_id').eq('id', userId).single()
    if (prof?.stripe_customer_id) {
      customerId = prof.stripe_customer_id
    } else {
      const customer = await stripe.customers.create({ email, metadata: { userId } })
      customerId = customer.id
      await supabase.from('profiles').upsert({ id: userId, email, stripe_customer_id: customerId }, { onConflict: 'id' })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.headers.origin}/pricing?success=1`,
      cancel_url: `${req.headers.origin}/pricing?canceled=1`,
      allow_promotion_codes: true,
      metadata: { userId }
    })
    return res.status(200).json({ url: session.url })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'checkout error' })
  }
}
