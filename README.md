# Sidecar Classroom

Live group slides with a private AI debrief for the instructor.

**App:** https://kamg89.github.io/quick-webapp/

This is a small classroom tool inspired by the group-work/debrief workflow in the instructor's October 10, 2026 workshop notes. Groups write directly in their own slide decks. An instructor sees the work on the left and a separate debrief on the right. The notes themselves, private classroom content, and credentials are not part of this repository. This is an independent tool, not a Harvard or Google product.

## Run an activity

1. Open the app and enter your **instructor access key**. This is different from your OpenAI key. The deployment owner has a private local access file; it is not committed here.
2. Choose **New activity**. Set the task, group count (1–20), three starter prompts, debrief focus, and number of debrief slides (1–6). The starter task asks groups to reflect on using AI as a tutor; it can be replaced with any classroom task.
3. Open **Group links** and send each link to its group. Each group gets a separate capability link. No student account or email address is required. Anyone holding that link can view that group's work; editing is allowed only while the activity is live.
4. Click **Start activity** and set the duration (eight minutes by default, up to 120). Students can edit text boxes, format them, change the slide theme, and add, duplicate, or delete slides. Text saves after a short pause and other browsers poll for updates every three seconds. Optional **Contributors** labels attach names to each text box; names are self-reported and remain optional. Choose one recorder per text box; simultaneous changes to the same box produce a conflict prompt instead of silently overwriting saved work.
5. Use **Customize** in the debrief panel to choose your purpose and instructions. Automatic synthesis runs on the server every minute while the activity is live, automatic updates are enabled, and time remains. Empty or unchanged work skips the AI call. **Update now** requests a manual update; concurrent/rapid duplicate requests are suppressed.
6. Use the monitor button to open a private second window. Put that on the instructor monitor. **Present debrief** opens a minimal 16:9 slide with synthesis, attributed examples, and a discussion question; private facilitation notes stay out of the projected slide. Use arrow keys, Space, or the controls to navigate, Full screen to expand, and Escape to close. The presented deck stays fixed while new AI drafts arrive; **Load latest** lets you choose when to switch. The separate **Present** toolbar button shows group slides. Sharing a student's group link never shares the debrief. Review AI observations and source links before using them in discussion.
7. Pause or end the activity to stop group editing and automatic AI calls. A paused activity can be restarted with a duration of your choice. **History** retains prior debriefs; **Export** downloads a JSON backup of the activity and private debrief, without group access tokens.

Tell students that their slide text is sent to OpenAI to prepare a private classroom debrief. Use only contributor names people agree to display; avoid sensitive information. Omitting names leaves group and slide attribution intact. There is no automatic grading.

## What the first version includes

- Separate group decks and instructor workspace; one instructor access key for this deployment.
- Structured text boxes, headings, bold/italic/alignment/font size/color, three themes, slide duplication/deletion, and presentation mode.
- Autosave, live polling, per-text-box optimistic concurrency checks, and an explicit conflict-resolution screen.
- Activity timer, editable task, group-link replacement/revocation, and end-of-activity editing controls.
- One-minute server-scheduled debriefs with configurable focus and exact slide count, verified quote cards or clearly labeled summaries, saved contributor/group/slide attribution, private speaker notes, generation status, errors, and history.
- A clean debrief projection view that keeps its current draft steady during live updates.
- Revocable, seven-day external tester invitations limited to a separate sample activity.
- An explicitly labeled, browser-local demo using illustrative group responses. Demo content is never sent to the database or AI.

This is a focused slide workspace, not a full Google Slides replacement: there is no PPTX import/export, drag-anywhere layout, images, shapes, cursor presence, character-by-character co-editing, or Google account integration. JSON export is available. The one-minute schedule is a cadence, not an exact delivery deadline; model processing adds latency. Inactive/paused Supabase projects cannot run scheduled updates. The Free plan can pause projects after inactivity, so check the app before class.

## Architecture and access boundaries

The frontend is static HTML/CSS/JavaScript hosted on GitHub Pages. It calls one Supabase Edge Function, `classroom`, over HTTPS. That function validates the owner instructor capability, an activity-scoped tester capability, or a 256-bit group capability before accessing the database. Students cannot request instructor settings, debriefs, history, other groups' slides, or AI calls. Server responses use an explicit student-safe session projection.

All five application tables have RLS enabled, with no browser policies and no `anon`/`authenticated` table privileges. Only the server service role accesses them. The service key supplied by Supabase stays inside the Edge Function. `verify_jwt = false` is intentional: every action is authenticated by the function's custom capability mechanism. It does not mean unauthenticated access is allowed.

Supabase Vault stores `OPENAI_API_KEY`, `OPENAI_MODEL`, `INSTRUCTOR_KEY_SHA256`, `SCHEDULER_SECRET`, and `CLASSROOM_FUNCTION_URL`. A zero-argument SQL function exposes only the four runtime values to the service role. Its execute privilege is explicitly revoked from PUBLIC, anon, and authenticated; its search path is empty. The instructor access key is stored only as a SHA-256 hash on the server. Group links are retained in the protected groups table so the instructor can copy them again. No secrets belong in `public/config.js` or GitHub Actions.

The `pg_cron` job calls the Edge Function through `pg_net` every minute, using its own Vault secret. It makes no HTTP call when no eligible activity is live. The AI uses the OpenAI Responses API with structured JSON output, `store: false`, and `gpt-4.1-mini`. Student text is treated as evidence, not instructions; generated content is rendered as escaped text. Source IDs are checked against actual slides and blocks. Names and groups come from saved source records, never model-invented attribution. Quotations are checked against the original text; if the model rewrites a quotation, the server substitutes a bounded literal excerpt from the linked block. Summaries are explicitly labeled as paraphrases. Claims still require instructor judgment.

Each activity is bounded to 20 groups, eight slides per group, and six text boxes per slide. An AI request refuses oversized input instead of silently dropping groups. The scheduler processes at most four eligible activities per invocation; this deployment is intended for one instructor's active class at a time.

## Let someone test the app

The owner has a separate sample classroom with fictional contributor names and a real four-slide AI debrief. Its invitation is a URL with `#test=...`; the raw invitation is kept only in the private handoff file, not this repository. Share that invitation with the intended tester. The ordinary app URL requires the owner access key; the browser-local demo can also be opened without a key.

The test link grants instructor controls only inside that sample activity. It cannot list, read, edit, or delete other activities, create activities, or create invitations. The server checks the activity scope for every action. The invitation expires seven days after creation, each test activity is limited to 30 AI generation attempts, and a tester can start at most 30 minutes per run. The sample opens in draft state, so it makes no scheduled AI calls until started. Empty or unchanged work still skips generation.

To try the full workflow, edit a group response and its optional Contributors label, click **Start activity**, and watch the next one-minute check. Use **Group links** to try the student perspective in another browser. Click **Present debrief** to project the latest synthesis. Pause the activity when finished. The owner can use Activity settings to replace or revoke a test invitation. A replacement invalidates the previous link; it does not reset the activity's AI budget. Keep the master instructor access key private.

## Development and deployment

Node 22 or newer is required. Browser code has no third-party runtime dependencies. Linkedom is pinned as a development-only DOM test dependency, and the lockfile is committed.

```sh
npm ci
npm test
npm run dev
# Local preview: http://127.0.0.1:4173
npm run build
```

Pushes to `main` run tests, build `dist/`, and publish through the Pages workflow. The production endpoint is in `public/config.js`; it is public connection metadata, not a secret. Relative asset paths support the `/quick-webapp/` project URL.

The Supabase project is **Sidecar Classroom**, reference `hebqieisdhbnxukoktjs`, in the owner-selected **Kamfree** organization, US East. Supabase quoted **$0/month** at creation on October 10, 2026. OpenAI API usage is billed separately to the configured key; GitHub/Supabase free hosting does not make AI inference free.

The database migration is in `supabase/migrations/`. The Edge Function source is in `supabase/functions/classroom/`. For deployment from an authenticated Supabase CLI:

```sh
supabase functions deploy classroom --project-ref YOUR_NEW_PROJECT_REF --no-verify-jwt --use-api
```

Apply the migration only to the intended new project. Install Vault values privately; never put their values in source, migrations, logs, issue comments, or build artifacts. Configure the function URL and the allowed frontend origins for any new deployment. On this deployment, Vault was configured through the connected Supabase management tool because the local CLI did not have a management access token. GitHub Pages redeploys do not redeploy the Edge Function or alter the database.

To replace an OpenAI key, update the existing `OPENAI_API_KEY` entry in this project's Supabase Vault. Runtime configuration refreshes within about a minute. Revoke the old key in OpenAI after the replacement is working. The setup key supplied in chat should be rotated before classroom use.

## Initial verification — October 10, 2026 (original release)

- Unit checks: input limits, token handling, constrained formatting, student-safe data projection, and source-ID validation.
- DOM checks: instructor navigation, text editing, duplicate/delete, presentation isolation, safe rendering of HTML-like input, and absence of instructor controls in the student workspace.
- Live API checks: two independent group editors, unauthorized and cross-group access rejection, stale revision conflicts, activity start/end restrictions, revoked group links, history, and unchanged-input skipping.
- A real OpenAI request produced a saved structured debrief with valid source-slide references; student retrieval still omitted that debrief.
- Supabase security advisor: no error/warning findings; five informational RLS-without-policy notices are intentional for server-only tables. Direct browser access is denied through both privileges and RLS.
- The original two-minute cron schedule generated a debrief without a browser or manual trigger. Its disposable activity was removed after verification.
- GitHub Actions [deployment 38061905731](https://github.com/kamg89/quick-webapp/actions/runs/38061905731) passed all seven unit/DOM tests, built the static app, and published successfully. HTTP checks verified the deployed HTML, JavaScript, CSS, configuration, and icon against their source bytes.
- A blank four-group, four-debrief-slide activity is ready in draft state. No AI calls run until a live activity or manual update requests them. Other Supabase projects retained their prior active/inactive states.
- **Original-release visual verification limit:** no browser was connected during the initial release. DOM, build, live API, and deployment checks do not establish pixel-perfect appearance or full interactive browser compatibility. Check the page on the classroom display before class.

Keep `.private/` local. Live verification scripts create disposable activities and use the private access file; they are not run in public CI. The original workshop notes and the separate Bachelor's Essay materials remain unchanged.

## Revision — October 10, 2026: one-minute instructor debrief

Updated `public/`, the `classroom` Edge Function, the contributor/test-access migration, and automated/live verification scripts. The active cron job now uses `* * * * *`; its original job name is retained. Instructor-facing status and automatic fallback use the same one-minute cadence.

The prompt now asks for substantive synthesis of student reasoning, supported contrasts, and unresolved questions, with concise student-facing text and private facilitation notes. A strict schema enforces the requested slide count. Canonical attribution and literal-quote fallback prevent invented names or paraphrases disguised as quotations. The projection view keeps a snapshot until the instructor chooses to load a newer draft, avoiding surprise slide changes during discussion. Practical lesson: use server-validated evidence and deliberate projection controls, not just prompt instructions.

- All 16 automated unit/DOM checks pass, covering attribution, literal quote fallback, exact slide count, projection privacy, escaping, and tester entry, alongside the existing editing checks. The static build passes.
- Live API checks passed for real OpenAI output, verified source attribution, student isolation, concurrent edits, history, unchanged-input skipping, group-link revocation, and activity start/end. Dedicated tester checks rejected cross-activity reads/writes/AI requests and owner-only actions; revocation took effect immediately.
- Two actual server-scheduled generations, with changed group work between them, started **59.8 seconds apart**. No browser or manual AI request triggered them; disposable records were removed afterward.
- Isolated headless Chrome checks passed for the real test classroom, all four generated projection slides, keyboard controls, fullscreen, separate private window, and 1440/1280/390-pixel layouts without JavaScript errors. Screenshots were inspected. Browser checks found and resolved narrow-screen slide overflow; the presenter now also fits longer permitted text into the slide area.
- Security advisor still reports no error/warning findings. Its five [RLS-without-policy information notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) are intentional for the server-only tables.
- The external tester activity contains fictional sample names, a real AI-generated debrief, and an expiring invitation; it is separate from the owner's draft teaching activity and starts idle. Production publication is verified after the app workflow runs.

Remaining limits: these checks do not guarantee zero defects or validate AI judgment. Chrome checks cover the tested screen sizes; other browsers and the actual classroom projector still need user testing. Names are optional contributor labels, not authenticated identity. The original release's no-browser limitation above is historical; this revision includes Chrome visual checks.

### Delivery decision

Use GitHub Pages for the interface and a dedicated Free-plan Supabase project for data, private AI execution, and scheduling. This removes the slide-download/upload step while keeping the instructor's synthesis separate from student editing. Capability links keep classroom entry simple; revision checks preserve conflicting drafts. For a future campus-wide deployment, replace the single instructor capability with institutional sign-in and add organization-level membership and retention controls.
