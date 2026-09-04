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
  z.object({
    action: z.literal('grant_subscription'),
    plan: z.enum(['comunidade', 'acertive', 'combo']),
    periodDays: z.number().int().min(1).max(3650).optional(),
  }).strict(),
  z.object({
    action: z.literal('revoke_subscription'),
  }).strict(),
])

export type AdminUserAction = z.infer<typeof adminUserActionSchema>
