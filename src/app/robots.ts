import type { MetadataRoute } from 'next'

// Служебная система: индексировать можно только главную (E0-04)
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/$',
      disallow: ['/admin', '/client', '/broker', '/contractor', '/api'],
    },
  }
}
