import fs from 'node:fs'
const f = 'src/app/membros/assertive-ecommerce-ia/analise/[id]/page.tsx'
let s = fs.readFileSync(f, 'utf8')

// 1) estado do indicador
if (!s.includes('setEspionage')) {
  s = s.replace(
    'const { id } = use(params)',
    'const { id } = use(params)\n  const [espionage, setEspionage] = useState<{ available: boolean; entries: number } | null>(null)'
  )
}

// 2) efeito que consulta o endpoint enquanto aguarda confirmação do produto
const poll = `  useEffect(() => {
    if (analysis?.status !== 'needs_input') return
    let active = true
    const check = async () => {
      try {
        const res = await fetch(\`/api/assertive/analyses/\${id}/espionage\`)
        if (!res.ok) return
        const data = await res.json()
        if (active) setEspionage({ available: data.available, entries: data.entries })
      } catch { /* indicador é best effort */ }
    }
    check()
    const timer = setInterval(check, 15000)
    return () => { active = false; clearInterval(timer) }
  }, [analysis?.status, id])

`
const anchor = '  const pollProgress = useEffectEvent(async () => {'
if (!s.includes(anchor)) { console.log('anchor poll não achado'); process.exit(1) }
s = s.replace(anchor, poll + anchor)

// 3) texto do details atualizado (auto-envio v1.3)
s = s.replace('abra a busca do Mercado Livre abaixo e clique em “Enviar esta página”.',
  'abra a busca do Mercado Livre abaixo e navegue: o coletor envia os dados públicos sozinho, sem clicar em nada.')
s = s.replace('O anúncio sai com posição real da busca e vendas dos concorrentes.',
  'O anúncio sai com posição real da busca e evidências verificadas dos concorrentes.')

// 4) pílula de status antes do details
const detailsAnchor = '                <details>'
if (!s.includes(detailsAnchor)) { console.log('anchor details não achado'); process.exit(1) }
const pill = [
  '                {espionage && (',
  "                  <div className={`flex items-center gap-2 mb-3 rounded-lg border px-3 py-2 text-xs ${espionage.available ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>",
  '                    <span>',
  "                      {espionage.available",
  '                        ? `🕵️ Espionagem pronta: ${espionage.entries} anúncios reais capturados — a pesquisa vai cruzar catálogo + coletor.`',
  "                        : '🕵️ Sem espionagem ainda: abra a busca no ML e navegue (o coletor envia sozinho), depois volte e atualize as referências.'}",
  '                    </span>',
  '                  </div>',
  '                )}',
  '',
].join('\n')
s = s.replace(detailsAnchor, pill + detailsAnchor)

fs.writeFileSync(f, s)
console.log('página de análise atualizada')
