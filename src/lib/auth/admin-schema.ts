import { z } from 'zod'

export const adminUserActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set_role'), role: z.enum(['member', 'admin']) }).strict(),
  z.object({
    action: z.literal('set_status'),
    status: z.enum(['active', 'suspended', 'banned']),
    reason: z.string().trim().min(3).max(500),
  }).strict(),
])

export type AdminUserAction = z.infer<typeof adminUserActionSchema>
