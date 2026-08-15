# Peer Tutoring Platform

Connects students who need academic help with peers who can tutor them: search by
subject, see genuinely open times, request a session, and review it afterwards.

Built as a React SPA with an AWS Amplify Gen 2 backend (Cognito, AppSync, DynamoDB,
Lambda).

---

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173.

With no AWS backend configured the app runs in **demo mode**: data is persisted in
your browser's `localStorage` and the UI shows a permanent "Demo data" banner. This
exists so the product can be reviewed end to end without an AWS account.

### Demo accounts

Password for all seeded accounts: `Password123`

| Email | Roles |
|---|---|
| `student@demo.peertutor.app` | Learner |
| `amara@demo.peertutor.app` | Tutor and learner |
| `daniel@demo.peertutor.app` | Tutor and learner |

The login screen lists these and fills the form when you click one. To wipe the demo
data, clear the `peertutor.db.v1` key from `localStorage` (or clear site data) and
reload; it re-seeds automatically.

---

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck then production build into `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm test` | Unit and integration tests |
| `npm run amplify:sandbox` | Deploy a personal AWS backend and write `amplify_outputs.json` |

> **Windows note:** if PowerShell blocks `npm.ps1` with an execution-policy error,
> run npm through `cmd`: `cmd /c "npm install"`.

---

## Architecture

```
src/
  components/     UI primitives, layout, domain components
  context/        Auth and toast providers
  lib/
    api/
      contract.ts        The Backend interface both adapters implement
      amplify/           AWS adapter (Cognito + AppSync + Lambda)
      local/             Demo adapter (localStorage), dev only
    config.ts     Backend selection and runtime config
shared/
  domain/         Types, business rules, search, subject catalogue
amplify/
  auth/           Cognito user pool
  data/           AppSync schema and authorisation
  functions/      session-actions Lambda (all state changes)
  backend.ts      Wiring, password policy, IAM grants
```

### One rules module, two backends

`shared/domain/rules.ts` holds every invariant: the session state machine, booking
preconditions, review eligibility, validation limits. **Both** the AWS Lambda and the
demo adapter import and call these same functions.

That is the central design decision. It means demo mode cannot be more permissive
than production, and the rules are unit-testable without deploying anything.

### Why writes go through a Lambda

Clients get **read** access to sessions, reviews, messages and notifications, and
**no write access at all**. Every state change is a named AppSync mutation handled by
`amplify/functions/session-actions/handler.ts`, which re-derives the caller's identity
from the Cognito claims and re-checks the rules.

A client that could write the `Session` model directly could confirm its own booking
request or mark a session complete to unlock a review. Routing writes through a
handler that owns the invariants removes that possibility.

### How double booking is prevented

Two students clicking the same slot at the same instant must produce exactly one
confirmed session. A read-then-write loses that race, so the Lambda performs a
**DynamoDB conditional update** on the availability slot:

```
SET #status = :booked  CONDITION #status = :open
```

The loser gets `ConditionalCheckFailedException`, which is translated into a
`SLOT_CONFLICT` error, and the UI refreshes the availability list. The slot is claimed
*before* the session record is created, and rolled back if creation fails, so a lost
race costs nothing.

`amplify/backend.ts` passes the generated table name to the function and grants it
IAM access.

### Privacy of public data

Guests can browse tutors, availability and reviews, which means those models are
readable with the AppSync API key. Therefore **no API-key-readable model contains an
email address**. `UserProfile` holds the email and is owner-only; the public display
name is denormalised onto `TutorProfile`, `Session` and `Review`. An integration test
asserts that no email appears in a public listing payload.

### Password policy

Cognito's policy is set explicitly in `amplify/backend.ts` (8+ characters, upper,
lower, number, no symbol required) and mirrored exactly by `passwordProblems()` in the
shared rules. If those drifted apart, a user would pass client validation and then be
rejected by Cognito with a confusing message.

---

## Deploying to AWS Amplify

1. Push this repository to GitHub.
2. In the Amplify console, **Create new app → GitHub**, and pick the branch.
3. Amplify detects `amplify.yml`. It deploys the backend with
   `ampx pipeline-deploy`, writes `amplify_outputs.json`, then builds the frontend,
   which switches itself out of demo mode automatically.
4. **Add the SPA rewrite rule.** Under *Hosting → Rewrites and redirects*, add:

   | Source | Target | Type |
   |---|---|---|
   | `/<*>` | `/index.html` | 404-200 (Rewrite) |

   Without it, deep links such as `/tutors/abc` return 404 on refresh.

`customHttp.yml` applies HSTS, `X-Frame-Options`, `X-Content-Type-Options`, a
referrer policy and a CSP.

### Environment variables

No AWS configuration is set by hand. Cognito and AppSync details arrive in
`amplify_outputs.json`, which is generated at deploy time and gitignored.

The only optional variables are in `.env.example`:

- `VITE_DATA_MODE` — `auto` (default), `amplify`, or `local`
- `VITE_APP_NAME` — display name in the header

Anything prefixed `VITE_` is embedded in the client bundle and is therefore public.
Never put a secret there.

---

## Testing

```bash
npm test
```

84 tests across two files:

- `src/domain.test.ts` — 57 tests over the shared rules: state machine, booking
  preconditions, slot overlap, review eligibility, rating aggregation, validation,
  search filtering, sorting and pagination.
- `src/backend.integration.test.ts` — 27 tests driving the real demo backend
  end to end: register and sign in, book a slot, lose a slot race, decline and
  cancel releasing the slot, authorisation failures, messaging gated on
  confirmation, and a review moving the tutor's aggregate.

### What the tests do not cover

Stated plainly, because these are the gaps:

- **No browser rendering tests.** Layout, responsive behaviour at 320-414px, and
  visual accessibility were reviewed in code but not verified in a real browser.
- **Cross-process booking concurrency on AWS.** The atomicity guarantee comes from
  the DynamoDB conditional write, which requires a deployed backend to exercise. The
  demo adapter's critical section makes the single-tab case deterministic and is
  tested; cross-tab writes to `localStorage` could still race.
- **The AWS adapter and Lambda have not been run.** They are type-checked but no
  deployment was performed, so no claim is made that they work in AWS.

---

## Known limitations

- **Search filters client-side.** `listTutorListings()` pages through tutors and
  applies filters in the browser. Fine at classroom or campus scale; a large
  deployment would need AppSync secondary indexes or OpenSearch.
- **No email or push notifications.** Notifications are in-app only. Email would need
  an SES identity and deliverability work.
- **Roles chosen at registration are held in `sessionStorage`** until the first
  authenticated load, because the `UserProfile` record cannot be written before
  Cognito confirms the email. If that is lost, the account defaults to learner and
  the role can be changed on the profile page.
- **No payments and no built-in video.** Both were explicitly ruled out of scope.
  Tutors can attach an https meeting link when they accept.
- **Meeting links cannot be edited after acceptance.**
- **No admin or moderation console.** Deferred.

---

## Documentation

- [`docs/01-project-requirements.md`](docs/01-project-requirements.md) — scope, user
  journeys, and the 43 acceptance criteria used as the completion gate
- [`docs/02-design-handoff.md`](docs/02-design-handoff.md) — design tokens, page
  inventory, responsive rules, required UI states, accessibility requirements
- [`docs/03-qa-report.md`](docs/03-qa-report.md) — test results, bugs found and
  fixed, and what remains unverified
