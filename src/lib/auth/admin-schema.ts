import { z } from 'zod'

export const adminUserActionSchema = z.union([
  z.object({ action: z.literal('set_role'), role: z.enum(['member', 'admin']) }).strict(),
  z.object({
    action: z.literal('set_status'),
    status: z.literal('active'),
    reason: z.string().trim().max(500).optional(),
  }).strict(),
  z.object({
    action: z.literal('set_status'),
    status: z.enum(['suspended', 'banned']),
    reason: z.string().trim().min(3).max(500),
  }).strict(),
])

export type AdminUserAction = z.infer<typeof adminUserActionSchema>
