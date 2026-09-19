'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, Puzzle, CheckCircle2, ShieldCheck } from 'lucide-react'

export default function ColetorInstalarPage() {
  const [passo, setPasso] = useState(1)

  return (
    <div className="min-h-screen bg-[#0c0c0c] px-4 py-6 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <Link href="/membros/assertive-ecommerce-ia/config" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-5 transition">
          <ArrowLeft className="w-4 h-4" /> Configurações
        </Link>

        <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">Instalar o coletor 🕵️</h1>
        <p className="text-gray-400 text-sm mb-6">
          O coletor é uma mini-extensão do Chrome. Instalação única de ~1 minuto.
          Ele envia ao Assertive apenas os trechos públicos das páginas do Mercado Livre
          que você visita — sem cookies, sem login, sem navegação automática.
        </p>

        <div className="space-y-4">
          {/* Passo 1 */}
          <div className={`bg-[#141414] border rounded-xl p-5 ${passo >= 1 ? 'border-amber-500/40' : 'border-[#1f1f1f]'}`}>
            <div className="flex items-center gap-3 mb-3">
              <span className="w-7 h-7 rounded-full bg-amber-500 text-black font-bold text-sm flex items-center justify-center">1</span>
              <h2 className="text-white font-semibold flex items-center gap-2">
                <Puzzle className="w-4 h-4 text-amber-500" /> Instale o Tampermonkey
              </h2>
            </div>
            <p className="text-gray-400 text-xs mb-3">
              Ele é o gerenciador que faz o coletor funcionar. Grátis e oficial.
            </p>
            <a
              href="https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setPasso(2)}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold px-4 py-2.5 rounded-lg transition"
            >
              <Download className="w-4 h-4" /> Instalar Tampermonkey (grátis)
            </a>
            <p className="text-gray-500 text-xs mt-2">
              Na loja: clique em <strong className="text-gray-300">“Adicionar ao Chrome”</strong> → <strong className="text-gray-300">“Adicionar extensão”</strong>.
            </p>
          </div>

          {/* Passo 2 */}
          <div className={`bg-[#141414] border rounded-xl p-5 ${passo >= 2 ? 'border-amber-500/40' : 'border-[#1f1f1f] opacity-70'}`}>
            <div className="flex items-center gap-3 mb-3">
              <span className="w-7 h-7 rounded-full bg-amber-500 text-black font-bold text-sm flex items-center justify-center">2</span>
              <h2 className="text-white font-semibold">Instale o coletor (o token já vem embutido)</h2>
            </div>
            <p className="text-gray-400 text-xs mb-3">
              Agora sim: clicar abaixo vai abrir a tela de instalação do Tampermonkey
              (uma página do próprio Tampermonkey, não do Assertive). Nela, clique em
              <strong className="text-gray-300"> “Instalar”</strong>.
            </p>
            <a
              href="/api/assertive/collect/script.user.js"
              onClick={() => setPasso(3)}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold px-4 py-2.5 rounded-lg transition"
            >
              <Download className="w-4 h-4" /> Instalar o coletor agora
            </a>
          </div>

          {/* Passo 3 */}
          <div className={`bg-[#141414] border rounded-xl p-5 ${passo >= 3 ? 'border-emerald-500/40' : 'border-[#1f1f1f] opacity-70'}`}>
            <div className="flex items-center gap-3 mb-3">
              <span className="w-7 h-7 rounded-full bg-emerald-500 text-black font-bold text-sm flex items-center justify-center">3</span>
              <h2 className="text-white font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Teste: clique em Espionar agora
              </h2>
            </div>
            <p className="text-gray-400 text-xs">
              Volte à análise e use o botão <strong className="text-gray-300">🎯 Espionar agora</strong>.
              A aba do ML abre, o coletor envia os dados públicos sozinho e a aba fecha
              em ~10 segundos.
            </p>
          </div>

          <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5">
            <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> Segurança
            </h3>
            <p className="text-gray-500 text-xs leading-relaxed">
              O coletor só lê trechos públicos (títulos, preços, fotos) das páginas do
              Mercado Livre em que você navega. Não envia cookies, não faz login, não
              navega sozinho e nunca publica nada. Os dados ficam disponíveis apenas
              para as SUAS análises, por até 6 horas.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
