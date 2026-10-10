# Sidecar Classroom

This repository is a separate HBS workshop app, not the Bachelor's Essay package. Read README.md first. Keep the workshop notes and all BE materials unchanged.

- Publish only tracked app files; never copy parent-folder records, `.private/`, credentials, or live classroom data into the repository or Pages artifact.
- Frontend changes go in `public/`. Database changes belong in CLI-generated migration files. Server changes go in `supabase/functions/classroom/` and require a separate Edge Function deployment.
- Preserve instructor/group authorization, RLS and revoked browser privileges, optimistic concurrency, and the private debrief response boundary.
- Do not expose the AI key or instructor key in client config, HTML, links, tests, or logs. Group links may contain only their own capability in the URL fragment. Explicit external testing may use a separate expiring tester capability in the URL fragment, restricted on the server to one dedicated test activity; never use the master instructor key in a link.
- Keep AI settings master-only and write-only for API keys. Validate before saving, preserve working settings on failure, and never place keys in browser storage. Class-code joins must preserve group scope and atomic individual allocation; display names are not authentication.
- AI calls require instructor or scheduler authorization. Keep the empty/unchanged-input skip, concurrency lock, timeout, and bounded input.
- Check `npm test` and `npm run build` after substantive changes. Use disposable live-test records when backend behavior changes. Record actual verification and limits in README.md.
- Keep the Free-plan constraint and other existing Supabase projects/repositories untouched. Never change plans or pause other projects to make room.
