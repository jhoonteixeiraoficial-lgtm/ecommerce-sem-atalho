'use client'

import { Metadata } from 'next'

interface SEOProps {
  title?: string
  description?: string
  image?: string
  url?: string
  type?: 'website' | 'article' | 'course'
  noIndex?: boolean
  noFollow?: boolean
  twitterCard?: 'summary' | 'summary_large_image'
  publishedTime?: string
  modifiedTime?: string
  authors?: string[]
  section?: string
  tags?: string[]
}

export function generateSEOMetadata({
  title = 'Ecommerce Sem Atalho - Venda no Mercado Livre sem Atalhos',
  description = 'Comunidade e ferramentas de IA para criar anúncios otimizados no Mercado Livre. Pesquisa de mercado automatizada, copy persuasivo e validação pré-publicação.',
  image = '/og-default.png',
  url = '/',
  type = 'website',
  noIndex = false,
  noFollow = false,
  twitterCard = 'summary_large_image',
  publishedTime,
  modifiedTime,
  authors,
  section,
  tags,
}: SEOProps = {}): Metadata {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ecommerce-sem-atalho.com'
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`
  const fullImage = image.startsWith('http') ? image : `${baseUrl}${image}`

  const metadata: Metadata = {
    title,
    description,
    robots: {
      index: !noIndex,
      follow: !noFollow,
      googleBot: {
        index: !noIndex,
        follow: !noFollow,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    openGraph: {
      title,
      description,
      url: fullUrl,
      siteName: 'Ecommerce Sem Atalho',
      type: type === 'course' ? 'website' : type,
      locale: 'pt_BR',
      images: [
        {
          url: fullImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      ...(publishedTime && { publishedTime }),
      ...(modifiedTime && { modifiedTime }),
      ...(authors && { authors }),
      ...(section && { section }),
      ...(tags && { tags }),
    },
    twitter: {
      card: twitterCard,
      title,
      description,
      images: [fullImage],
      creator: '@ecommercesematalho',
      site: '@ecommercesematalho',
    },
    other: {
      'mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-status-bar-style': 'default',
      'apple-mobile-web-app-title': 'Ecommerce Sem Atalho',
      'format-detection': 'telephone=no',
    },
    icons: {
      icon: '/favicon.ico',
      shortcut: '/favicon-16x16.png',
      apple: '/apple-touch-icon.png',
    },
    manifest: '/manifest.json',
  }

  return metadata
}

export function getPageSEO(
  page: 'home' | 'vsl' | 'assertive' | 'comunidade' | 'aulas' | 'materiais' | 'perfil' | 'assinatura'
) {
  const configs: Record<string, SEOProps> = {
    home: {
      title: 'Ecommerce Sem Atalho - Venda no Mercado Livre sem Atalhos',
      description: 'A única comunidade que ensina a criar anúncios profissionais no Mercado Livre usando IA. Pesquisa de mercado real, copy baseada em dados, validação automática antes de publicar.',
      url: '/',
      type: 'website',
    },
    vsl: {
      title: 'Como Vender no Mercado Livre sem Atalhos - Assista Agora',
      description: 'Descubra o método usado por vendedores tops para criar anúncios que convertem. IA faz a pesquisa, você aprova o resultado.',
      url: '/vsl',
      type: 'website',
    },
    assertive: {
      title: 'Assertive IA - Anúncios Otimizados para Mercado Livre',
      description: 'Ferramenta de IA que pesquisa o mercado, analisa concorrentes, gera copy persuasiva e valida no Mercado Livre antes de publicar. Economize horas e venda mais.',
      url: '/membros/assertive-ecommerce-ia',
      type: 'website',
    },
    comunidade: {
      title: 'Comunidade Ecommerce Sem Atalho',
      description: 'Conecte-se com vendedores que não aceitam atalhos. Dúvidas, networking, resultados reais e suporte direto.',
      url: '/membros/comunidade',
      type: 'website',
    },
    aulas: {
      title: 'Aulas - Ecommerce Sem Atalho',
      description: 'Curso completo: do zero ao anúncio profissional. Módulos de pesquisa, copy, imagens, validação e escala.',
      url: '/membros/aulas',
      type: 'website',
    },
    materiais: {
      title: 'Materiais de Apoio - Templates, Checklists e Guias',
      description: 'Baixe templates de ficha técnica, checklists de validação, guias de fotografia e planilhas de precificação.',
      url: '/membros/materiais',
      type: 'website',
    },
    perfil: {
      title: 'Meu Perfil - Ecommerce Sem Atalho',
      description: 'Gerencie sua conta, assinatura, anúncios criados e progresso nas aulas.',
      url: '/membros/perfil',
      type: 'website',
      noIndex: true,
    },
    assinatura: {
      title: 'Assinatura - Escolha seu Plano',
      description: 'Planos Comunidade, Assertive IA ou Combo. Acesso completo a aulas, ferramentas e comunidade.',
      url: '/membros/assinatura',
      type: 'website',
    },
  }
  return generateSEOMetadata(configs[page] || configs.home)
}