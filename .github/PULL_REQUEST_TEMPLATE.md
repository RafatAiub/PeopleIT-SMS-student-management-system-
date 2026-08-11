## What changed and why

<!-- What changed, why, and how you tested it. Screenshots/GIFs welcome for UI changes. -->

## Checklist

- [ ] `npm run typecheck` and `npm run lint` pass locally
- [ ] `npm run test --workspace=backend` passes (if backend code changed)
- [ ] I manually verified the change in the app (not just CI green)
- [ ] If I touched a Prisma model: the migration is included and named descriptively, and I ran it against a throwaway Neon branch first
- [ ] If I touched anything tenant-scoped: I double-checked the multi-tenant isolation rule
- [ ] No real credentials/secrets in this diff, including `.env.example`
