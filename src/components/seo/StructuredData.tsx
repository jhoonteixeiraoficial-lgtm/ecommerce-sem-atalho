'use client'

import { usePathname } from 'next/navigation'
import Script from 'next/script'

interface StructuredDataProps {
  type: 'WebSite' | 'WebPage' | 'Product' | 'Course' | 'Organization'
  data: Record<string, unknown>
}

export function StructuredData({ type, data }: StructuredDataProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': type,
    ...data,
  }

  return (
    <Script
      id="structured-data"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

export function WebsiteStructuredData() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ecommerce-sem-atalho.com'
  return (
    <StructuredData
      type="WebSite"
      data={{
        name: 'Ecommerce Sem Atalho',
        url: baseUrl,
        description: 'Comunidade e ferramentas de IA para vender no Mercado Livre sem atalhos. Anúncios otimizados, pesquisa de mercado automatizada e gestão completa.',
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${baseUrl}/busca?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      }}
    />
  )
}

export function CourseStructuredData({
  name,
  description,
  url,
  image,
  offers,
}: {
  name: string
  description: string
  url: string
  image?: string
  offers: { price: number; priceCurrency: string; availability: string }[]
}) {
  return (
    <StructuredData
      type="Course"
      data={{
        name,
        description,
        url,
        image,
        provider: {
          '@type': 'Organization',
          name: 'Ecommerce Sem Atalho',
          url: process.env.NEXT_PUBLIC_APP_URL || 'https://ecommerce-sem-atalho.com',
        },
        offers: offers.map(offer => ({
          '@type': 'Offer',
          ...offer,
          seller: {
            '@type': 'Organization',
            name: 'Ecommerce Sem Atalho',
          },
        })),
      }}
    />
  )
}

export function ProductStructuredData({
  name,
  description,
  url,
  image,
  price,
  currency = 'BRL',
  availability = 'InStock',
  brand = 'Ecommerce Sem Atalho',
  sku,
  aggregateRating,
  review,
}: {
  name: string
  description: string
  url: string
  image?: string
  price: number
  currency?: string
  availability?: string
  brand?: string
  sku?: string
  aggregateRating?: { ratingValue: number; reviewCount: number }
  review?: { author: string; datePublished: string; reviewBody: string; reviewRating: number }[]
}) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ecommerce-sem-atalho.com'
  return (
    <StructuredData
      type="Product"
      data={{
        name,
        description,
        url,
        image: image ? `${baseUrl}${image}` : undefined,
        sku,
        brand: {
          '@type': 'Brand',
          name: brand,
        },
        offers: {
          '@type': 'Offer',
          url,
          priceCurrency: currency,
          price,
          availability: `https://schema.org/${availability}`,
          seller: {
            '@type': 'Organization',
            name: 'Ecommerce Sem Atalho',
            url: baseUrl,
          },
        },
        aggregateRating: aggregateRating
          ? {
              '@type': 'AggregateRating',
              ratingValue: aggregateRating.ratingValue,
              reviewCount: aggregateRating.reviewCount,
            }
          : undefined,
        review: review?.map(r => ({
          '@type': 'Review',
          author: { '@type': 'Person', name: r.author },
          datePublished: r.datePublished,
          reviewBody: r.reviewBody,
          reviewRating: {
            '@type': 'Rating',
            ratingValue: r.reviewRating,
            bestRating: 5,
            worstRating: 1,
          },
        })),
      }}
    />
  )
}

export function OrganizationStructuredData() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ecommerce-sem-atalho.com'
  return (
    <StructuredData
      type="Organization"
      data={{
        name: 'Ecommerce Sem Atalho',
        url: baseUrl,
        logo: `${baseUrl}/logo.png`,
        sameAs: [
          'https://www.instagram.com/ecommercesematalho',
          'https://www.youtube.com/@ecommercesematalho',
          'https://www.linkedin.com/company/ecommercesematalho',
        ],
        contactPoint: {
          '@type': 'ContactPoint',
          telephone: '+55-11-99999-9999',
          contactType: 'customer service',
          availableLanguage: 'Portuguese',
        },
      }}
    />
  )
}