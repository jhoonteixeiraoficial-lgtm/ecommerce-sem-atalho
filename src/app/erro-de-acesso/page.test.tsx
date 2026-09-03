import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AccessErrorPage from './page'

describe('AccessErrorPage', () => {
  it('renders a generic access service failure without internal details', () => {
    const markup = renderToStaticMarkup(<AccessErrorPage />)

    expect(markup).toContain('Não foi possível verificar seu acesso')
    expect(markup).not.toContain('Supabase')
    expect(markup).not.toContain('service role')
  })
})
