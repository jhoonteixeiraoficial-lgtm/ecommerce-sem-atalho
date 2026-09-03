# Credential Rotation Runbook

## Approval Boundary

The following external or irreversible actions require explicit approval before execution:

```text
Rotate Supabase secret key, reset the owner password, revoke owner sessions,
inspect provider logs, and later purge credentials from Git history.
```

Do not perform provider-side changes or rewrite Git history without recorded explicit approval.

## Approved Execution Order

After explicit approval, perform these steps in this exact order:

1. Create a fresh Supabase secret key.
2. Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel production and preview environments.
3. redeploy and verify authenticated server routes.
4. Revoke the exposed key.
5. Reset the owner password through Supabase Auth.
6. Revoke all owner sessions.
7. Review Auth, database, Storage, and deployment logs from the first exposed commit.
8. Run Gitleaks across the full Git history.
9. Plan a separately approved history rewrite if a shared remote contains the secret.

## Handling Rules

- Never print secret values in terminal output, reports, commits, tickets, or chat.
- Record approvals and completion evidence without recording credential values.
- Treat key rotation and password/session changes as provider-side operations.
- Treat any history rewrite as a separate operation requiring explicit approval and coordination with all remote users.
