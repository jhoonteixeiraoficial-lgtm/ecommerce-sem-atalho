import { MetadataRoute } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ecommerce-sem-atalho.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin/',
        '/membros/assertive-ecommerce-ia/editor/',
        '/membros/assinatura-necessaria',
        '/onboarding',
        '/cadastro',
        '/login',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}