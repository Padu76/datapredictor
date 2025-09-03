// apps/web/pages/api/stripe/webhook.js
import Stripe from 'stripe'
import { buffer } from 'micro'
import { createClient } from '@supabase/supabase-js'

export const config = { api: { bodyParser: false } }

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE)

async function applyPlan(userId, plan, status, current_period_end) {
  // plan: 'basic'|'pro'; status es. 'active'
  const credits = plan === 'pro' ? 1000 : 200   // esempio crediti mensili
  await supabase.from('profiles').upsert({ id: userId, plan, credits }, { onConflict: 'id' })
  await supabase.from('subscriptions').upsert({
    user_id: userId,
    stripe_subscription_id: null, // lo aggiorniamo sotto se presente nell'event
    plan, status, current_period_end
  }, { onConflict: 'stripe_subscription_id' })
}

export default async function handler(req, res) {
  const sig = req.headers['stripe-signature']
  const buf = await buffer(req)
  let event

  try {
    event = stripe.webhooks.constructEvent(buf.toString(), sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed.', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId = session.metadata?.userId
        const subId = session.subscription
        // ricava il piano dal price
        const line = session.display_items?.[0] || session.line_items?.data?.[0]
        const priceId = line?.price?.id || session?.metadata?.priceId
        const plan = priceId === process.env.STRIPE_PRICE_ID_PRO ? 'pro' : 'basic'
        const sub = await stripe.subscriptions.retrieve(subId)
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: subId,
          plan,
          status: sub.status,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString()
        }, { onConflict: 'stripe_subscription_id' })
        // accredita crediti iniziali
        const credits = plan === 'pro' ? 1000 : 200
        await supabase.from('profiles').upsert({ id: userId, plan, credits }, { onConflict: 'id' })
        break
      }
      case 'invoice.payment_succeeded': {
        const inv = event.data.object
        const sub = await stripe.subscriptions.retrieve(inv.subscription)
        const userId = sub?.metadata?.userId || (await stripe.customers.retrieve(inv.customer)).metadata?.userId
        const plan = sub.items.data[0]?.price?.id === process.env.STRIPE_PRICE_ID_PRO ? 'pro' : 'basic'
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: inv.subscription,
          plan,
          status: sub.status,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString()
        }, { onConflict: 'stripe_subscription_id' })
        // rinnovo crediti
        const credits = plan === 'pro' ? 1000 : 200
        await supabase.from('profiles').update({ plan, credits }).eq('id', userId)
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        const userId = sub?.metadata?.userId || null
        const plan = sub.items.data[0]?.price?.id === process.env.STRIPE_PRICE_ID_PRO ? 'pro' : 'basic'
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: sub.id,
          plan,
          status: sub.status,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString()
        }, { onConflict: 'stripe_subscription_id' })
        if (sub.status !== 'active') {
          await supabase.from('profiles').update({ plan: 'free' }).eq('id', userId)
        }
        break
      }
      default:
        // ignora altri eventi
        break
    }

    return res.status(200).json({ received: true })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'webhook handler error' })
  }
}
