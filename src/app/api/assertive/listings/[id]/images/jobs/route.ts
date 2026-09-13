import { requireCommunityUser } from '@/app/api/community/helpers'
import { getImageJobSnapshot } from '@/lib/assertive/image-jobs'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response

  const { id } = await context.params
  try {
    return Response.json(await getImageJobSnapshot(id, auth.authorizedUser.id))
  } catch (error) {
    const notFound = error instanceof Error && error.message.startsWith('Anúncio não encontrado')
    return Response.json(
      { error: notFound ? 'Anúncio não encontrado.' : 'Não foi possível consultar as imagens.' },
      { status: notFound ? 404 : 500 }
    )
  }
}
