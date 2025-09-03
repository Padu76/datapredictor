// apps/web/pages/index.jsx
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";

// --- Branding da ENV (inserite su Vercel) ---
const brandName = process.env.NEXT_PUBLIC_BRAND_NAME || "DataPredictor";
const brandColor = process.env.NEXT_PUBLIC_BRAND_COLOR || "#f97316"; // arancione di default
const brandLogo = process.env.NEXT_PUBLIC_BRAND_LOGO || "/logo.svg";

export default function Home() {
  const [user, setUser] = useState(null);

  // --- Supabase Auth ---
  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  return (
    <main className="font-sans bg-white text-gray-900">
      {/* HERO */}
      <section className="relative h-[90vh] flex flex-col items-center justify-center text-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-8"
        >
          <Image src={brandLogo} alt="logo" width={80} height={80} className="mx-auto mb-6" />
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Trasforma i tuoi dati in{" "}
            <span style={{ color: brandColor }}>decisioni concrete</span>
          </h1>
          <p className="max-w-2xl text-lg md:text-xl text-gray-600 mb-8">
            Carica i tuoi file, ottieni KPI, previsioni e consigli personalizzati.
            <br /> Semplifica il lavoro, accelera le scelte.
          </p>
          <a
            href={user ? "/upload" : "/login"}
            className="inline-block px-6 py-3 rounded-xl text-white font-semibold shadow-lg"
            style={{ backgroundColor: brandColor }}
          >
            {user ? "Carica i tuoi dati" : "Accedi per iniziare"}
          </a>
        </motion.div>

        {/* Mockup Dashboard */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.6 }}
          className="mt-12"
        >
          <Image
            src="/mockup-dashboard.png"
            alt="Dashboard preview"
            width={900}
            height={500}
            className="rounded-2xl shadow-xl border"
          />
        </motion.div>
      </section>

      {/* PER CHI È */}
      <section className="py-20 bg-gray-50 px-6">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
          Per chi è {brandName}?
        </h2>
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {[
            { title: "Manager", text: "Report rapidi per decisioni strategiche." },
            { title: "Startup", text: "Cresci più veloce con insight chiari sui tuoi dati." },
            { title: "Retailer & eCommerce", text: "Monitora vendite, canali e prodotti con facilità." }
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.2 }}
              className="bg-white rounded-2xl shadow-md p-8 hover:shadow-xl transition"
            >
              <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
              <p className="text-gray-600">{item.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA FINALE */}
      <section className="py-20 text-center">
        <h2 className="text-3xl font-bold mb-6">Pronto a iniziare?</h2>
        <a
          href={user ? "/upload" : "/login"}
          className="inline-block px-6 py-3 rounded-xl text-white font-semibold shadow-lg"
          style={{ backgroundColor: brandColor }}
        >
          🚀 {user ? "Carica i tuoi dati" : "Accedi e inizia ora"}
        </a>
      </section>

      {/* Sticky CTA mobile */}
      <div className="fixed bottom-4 inset-x-0 flex justify-center md:hidden">
        <a
          href={user ? "/upload" : "/login"}
          className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg w-[90%] text-center"
          style={{ backgroundColor: brandColor }}
        >
          🚀 {user ? "Carica i tuoi dati" : "Accedi e inizia ora"}
        </a>
      </div>
    </main>
  );
}
