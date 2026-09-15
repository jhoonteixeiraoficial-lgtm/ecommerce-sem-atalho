import { MetadataRoute } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ecommerce-sem-atalho.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    '',
    '/login',
    '/cadastro',
    '/onboarding',
    '/politicas/privacidade',
    '/politicas/termos',
    '/vsl',
    '/membros/assertive-ecommerce-ia',
    '/membros/assertive-ecommerce-ia/novo',
    '/membros/assertive-ecommerce-ia/publicados',
    '/membros/assertive-ecommerce-ia/config',
    '/membros/aulas',
    '/membros/comunidade',
    '/membros/dashboard',
    '/membros/lives',
    '/membros/materiais',
    '/membros/perfil',
    '/membros/suporte',
    '/membros/calendario',
    '/membros/assinatura-necessaria',
    '/membros/atualizacoes',
  ].map(route => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: route === '' ? 1 : 0.8,
  }))

  return staticRoutes
}