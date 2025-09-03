// apps/web/pages/pricing.jsx
import Head from 'next/head'
import Link from 'next/link'
import CheckoutButton from '../components/CheckoutButton'

const brandColor = process.env.NEXT_PUBLIC_BRAND_COLOR || '#0ea5e9'
const brandName  = process.env.NEXT_PUBLIC_BRAND_NAME  || 'DataPredictor'

export default function Pricing() {
  return (
    <>
      <Head><title>Prezzi — {brandName}</title></Head>
      <main className="min-h-screen bg-gray-100 font-sans">
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <Link href="/" className="text-sm text-gray-500 hover:underline">← Home</Link>
            <h1 className="text-2xl md:text-3xl font-extrabold">Prezzi</h1>
            <div />
          </div>
        </header>

        <div className="max-w-6xl mx-auto px-4 py-12 grid md:grid-cols-3 gap-6">
          {/* Free */}
          <div className="rounded-2xl shadow p-6 bg-white">
            <h3 className="text-xl font-bold mb-2">Free</h3>
            <p className="text-3xl font-extrabold mb-4">€ 0<span className="text-base font-normal">/mese</span></p>
            <ul className="list-disc ml-6 space-y-2 text-gray-700">
              <li>5 crediti/mese</li>
              <li>Analisi base + PDF</li>
              <li>Advisor rule-based</li>
            </ul>
            <Link href="/upload" className="mt-6 inline-block px-4 py-2 rounded-xl text-white font-semibold shadow" style={{ backgroundColor: brandColor }}>
              Inizia gratis
            </Link>
          </div>

          {/* Basic */}
          <div className="rounded-2xl shadow p-6 bg-white border-2" style={{ borderColor: brandColor }}>
            <h3 className="text-xl font-bold mb-2">Basic</h3>
            <p className="text-3xl font-extrabold mb-1">€ 29<span className="text-base font-normal">/mese</span></p>
            <p className="text-sm text-gray-500 mb-4">ideale per creator e freelance</p>
            <ul className="list-disc ml-6 space-y-2 text-gray-700">
              <li>200 crediti/mese</li>
              <li>Advisor LLM</li>
              <li>What-if Pricing</li>
              <li>Supporto email</li>
            </ul>
            <div className="mt-6">
              <CheckoutButton priceId={process.env.STRIPE_PRICE_ID_BASIC} />
            </div>
          </div>

          {/* Pro */}
          <div className="rounded-2xl shadow p-6 bg-white">
            <h3 className="text-xl font-bold mb-2">Pro</h3>
            <p className="text-3xl font-extrabold mb-1">€ 79<span className="text-base font-normal">/mese</span></p>
            <p className="text-sm text-gray-500 mb-4">per team e agenzie</p>
            <ul className="list-disc ml-6 space-y-2 text-gray-700">
              <li>1000 crediti/mese</li>
              <li>Advisor LLM potenziato</li>
              <li>Branding white-label</li>
              <li>Priorità supporto</li>
            </ul>
            <div className="mt-6">
              <CheckoutButton priceId={process.env.STRIPE_PRICE_ID_PRO} />
            </div>
          </div>
        </div>

        <div className="text-center pb-12">
          <small className="text-gray-500">Hai già un abbonamento? <Link href="/api/stripe/portal" className="underline">Gestiscilo dal Customer Portal</Link></small>
        </div>
      </main>
    </>
  )
}
