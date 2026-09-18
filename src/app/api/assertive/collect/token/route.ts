import { NextRequest } from 'next/server'
import { requireCommunityUser, readJson } from '@/app/api/community/helpers'
import { getUserCollectToken, rotateUserCollectToken } from '@/lib/assertive/collect-token'

export const runtime = 'nodejs'

/**
 * Gerencia o token pessoal do coletor do navegador.
 * GET  → token atual (cria se não existir)
 * POST → rotaciona (invalida o anterior)
 */

export async function GET() {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  try {
    const token = await getUserCollectToken(auth.authorizedUser.id)
    return Response.json({ token })
  } catch {
    return Response.json({ error: 'Não foi possível gerar o token agora.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const body = await readJson(req)
  if (body.response) return body.response
  const action = (body.body as { action?: string } | null)?.action
  if (action !== 'rotate') {
    return Response.json({ error: 'Ação inválida.' }, { status: 400 })
  }
  try {
    const token = await rotateUserCollectToken(auth.authorizedUser.id)
    return Response.json({ token })
  } catch {
    return Response.json({ error: 'Não foi possível renovar o token agora.' }, { status: 500 })
  }
}
