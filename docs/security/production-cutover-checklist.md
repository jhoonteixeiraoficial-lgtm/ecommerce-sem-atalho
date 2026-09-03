# Production Security Cutover Checklist

## Pre-Cutover (before any production changes)

- [ ] 1. Confirm Supabase API key is rotated: new `SUPABASE_SERVICE_ROLE_KEY` active, old key revoked
- [ ] 2. Confirm `NEXT_PUBLIC_SUPABASE_ANON_KEY` rotated if exposed
- [ ] 3. Confirm owner password reset completed and all old sessions revoked
- [ ] 4. Create database backup: record backup ID and timestamp
- [ ] 5. Export current Auth user IDs: `SELECT id, email FROM auth.users`
- [ ] 6. Export current profile fields: `SELECT id, full_name, email, role FROM profiles`
- [ ] 7. Confirm no uncommitted changes in working tree (git status clean)

## Migration Application

- [ ] 8. Apply migration 010 to staging: `npx supabase db push --project-ref <staging-ref>`
- [ ] 9. Run pgTAP tests against staging: `npm run test:db`
- [ ] 10. Run application tests: `npm run test`
- [ ] 11. Run typecheck: `npm run typecheck`
- [ ] 12. Run build: `npm run build`
- [ ] 13. Verify all pass before proceeding

## Owner Seed

- [ ] 14. Verify owner Auth user exists: `SELECT id FROM auth.users WHERE id = 'd8c3528e-471e-4835-85a6-c9effb38fdf2'`
- [ ] 15. Apply owner seed: `psql -f supabase/production/010_seed_owner_admin.sql`
- [ ] 16. Verify owner has admin role: `SELECT role FROM user_roles WHERE user_id = 'd8c3528e-471e-4835-85a6-c9effb38fdf2'`
- [ ] 17. Verify owner has active status: `SELECT status FROM account_status WHERE user_id = 'd8c3528e-471e-4835-85a6-c9effb38fdf2'`

## Access Verification

- [ ] 18. Login as owner: verify admin area accessible
- [ ] 19. Login as second account: verify member-only access (no admin area)
- [ ] 20. Attempt direct profile role update via Supabase REST: verify RLS blocks
- [ ] 21. Attempt direct subscription status update via Supabase REST: verify RLS blocks
- [ ] 22. Verify audit log entries exist for owner seed

## Rollback Rehearsal

- [ ] 23. Apply rollback script in staging: `psql -f supabase/rollbacks/010_security_foundation.down.sql`
- [ ] 24. Verify legacy policies are NOT restored (rollback is staging-only)
- [ ] 25. Re-apply migration 010 to restore staging state

## Production Application

- [ ] 26. Apply migration 010 to production: `npx supabase db push --project-ref <production-ref>`
- [ ] 27. Apply owner seed to production: `psql -f supabase/production/010_seed_owner_admin.sql`
- [ ] 28. Verify production owner admin access
- [ ] 29. Deploy Next.js application: `vercel --prod`

## Post-Cutover Evidence

- [ ] 30. Record in `docs/security/staging-migration-report.md`:
  - Test output (pgTAP, vitest, typecheck, build)
  - Account-role assertions
  - Failed escalation attempts
  - Backup identifier
  - Rollback result
  - Timestamps and operator
