# QA Report

**Owner:** QA Tester (Role 4)
**Build:** initial implementation, verified locally on Windows, Node 24.19.0
**Mode tested:** demo (browser-local persistence). The AWS backend was **not**
deployed; see "Not verified" below.

---

## 1. Scope of verification

### Automated, executed, passing

| Gate | Command | Result |
|---|---|---|
| Type safety | `tsc --noEmit` | Clean, no errors |
| Unit tests | `vitest run` | 57 passed |
| Integration tests | `vitest run` | 27 passed |
| Production build | `vite build` | Succeeded, 905 modules |

Total: **84 tests passing.**

Bundle output:

```
dist/index.html                    1.04 kB
dist/assets/index.css             31.18 kB  (gzip  6.30 kB)
dist/assets/localBackend.js       23.25 kB  (gzip  8.01 kB)
dist/assets/index.js             132.01 kB  (gzip 35.96 kB)
dist/assets/react.js             164.64 kB  (gzip 53.73 kB)
dist/assets/amplifyBackend.js    268.49 kB  (gzip 77.35 kB)
```

The two backend adapters are separate chunks, so demo mode never downloads the
Amplify SDK and vice versa.

### Acceptance criteria with executed evidence

Verified by integration tests running against the real backend adapter:

| AC | Criterion | Evidence |
|---|---|---|
| AC-1 | Register, persist, sign in | passing |
| AC-2 | Duplicate email rejected specifically | passing |
| AC-3 | Weak password rejected | passing, and the rule mirrors the Cognito policy |
| AC-4 | Wrong password and unknown email give an identical message | passing, messages compared for equality |
| AC-8 | Subject filtering returns only matching tutors | passing |
| AC-9 | Filters work and combine as AND | passing |
| AC-10 | Sorting by rating, rate, reviews, soonest | passing |
| AC-12 | Pagination clamps out-of-range pages | passing |
| AC-13 | Only published tutors with a subject and bio are listed | passing |
| AC-15 | Card and profile agree on rating, rate, subjects | passing, compared per tutor |
| AC-16 | Unrated tutors are null, not zero, and excluded from rating filters | passing |
| AC-17 | Overlaps rejected; booked slots cannot be deleted; past slots rejected | passing |
| AC-18 | Past slots not bookable | passing |
| AC-19 | Booking creates a PENDING session and marks the slot taken | passing |
| AC-20 | Second student on the same slot gets a conflict | passing in-tab; see caveat |
| AC-21 | Duplicate request from the same student rejected | passing |
| AC-22 | Decline and cancel both release the slot | passing |
| AC-23 | Terminal sessions cannot be changed | passing |
| AC-24 | A student cannot accept or complete their own request | passing |
| AC-25 | Review requires a completed session | passing |
| AC-26 | Second review rejected | passing |
| AC-27 | Rating range and comment length validated | passing |
| AC-28 | Aggregate recomputed from real reviews | passing, mean compared |
| AC-29 | Non-participant cannot read a session or its messages | passing |
| AC-30 | Empty and over-long messages rejected | passing |
| AC-40 | Build and typecheck clean | passing |
| AC-41 | No committed secret or localhost URL | see section 4 |

---

## 2. Bugs found and fixed

### BUG-001 — Demo data never re-seeds after storage is cleared
- **Severity:** HIGH
- **Feature:** Demo persistence layer
- **Steps:** Load the app so it seeds. Clear `localStorage` (user action, another
  tab, or a test reset) without reloading. Perform any action that reads data.
- **Expected:** The platform re-seeds, or at minimum recovers.
- **Actual:** `ensureReady()` used a one-shot module-level promise. Once resolved it
  never ran again, so the app showed zero tutors and every seeded login failed with
  "That email and password combination is not correct" until a full page reload.
- **Found by:** 19 integration tests failing after the first, which is exactly the
  symptom a user would hit.
- **Fix:** Readiness now inspects the actual database on every call and re-seeds when
  empty, keeping an in-flight promise only to prevent concurrent double-seeding.
- **Retested:** All 84 tests pass. **Verified fixed.**

### BUG-002 — Mobile action bar overlapped the bottom tab bar
- **Severity:** MEDIUM
- **Feature:** Tutor profile, mobile layout
- **Steps:** Sign in, open a tutor profile below 1024px.
- **Expected:** Both the booking action bar and the dashboard tab bar are usable.
- **Actual:** Both were `fixed bottom-0`, so the booking bar sat on top of the tab
  bar, making navigation unreachable.
- **Fix:** The booking bar is offset to `bottom-[4.5rem]` when authenticated, and a
  spacer prevents it covering the last review.
- **Retested:** Code-level only. **Not visually confirmed** — no browser available.

### BUG-003 — Scroll anchor pointed at the wrong element
- **Severity:** LOW
- **Feature:** Tutor profile, mobile "See times" button
- **Actual:** The anchor was a zero-height div after the action bar, so the button
  scrolled past the availability panel instead of to it.
- **Fix:** Anchor moved onto the availability `aside` with `scroll-mt-24`.
- **Retested:** Code-level only.

### BUG-004 — Full page reload inside the SPA
- **Severity:** LOW
- **Feature:** Availability page, "Publish your profile" prompt
- **Actual:** A bare `<a href="/dashboard/profile">` caused a full document reload,
  discarding app state and re-running the session check.
- **Fix:** Replaced with a router `Link`.
- **Retested:** Build and typecheck clean.

### BUG-005 — Client and server password rules disagreed
- **Severity:** MEDIUM (would have been HIGH on deployment)
- **Feature:** Registration
- **Found:** During implementation review, before any test run.
- **Actual:** Client validation required a letter and a number. Cognito's default
  policy additionally requires upper and lower case and a symbol. A user could pass
  client validation and then be rejected by Cognito with an opaque error.
- **Fix:** The Cognito policy is now set explicitly in `amplify/backend.ts` (8+,
  upper, lower, number, no symbol) and `passwordProblems()` mirrors it exactly. A
  test asserts the mirrored rules, and the registration form shows a live checklist.
- **Retested:** Unit test passing. The Cognito half is **unverified** without a
  deployment.

### BUG-006 — Type errors that would have failed the Amplify build
- **Severity:** MEDIUM
- Three separate rounds of `tsc` surfaced 19 real type errors, including
  `allow.resource(...)` used at model level where the installed Amplify version only
  supports it at schema level. Left unfixed, `npm run build` in Amplify Hosting would
  have failed the deploy.
- **Fix:** Schema-level function grant; two missing fields added to shared types;
  record mappers relaxed to accept both query and mutation result shapes.
- **Retested:** `tsc --noEmit` clean.

---

## 3. Product character review (AC-37, AC-38, AC-39)

Assessed by reading the rendered markup structure, not by viewing the page.

**Does it read as an advertisement?** No, based on composition:

- The landing page's largest element is a functional search form, not a slogan.
- Zero fabricated statistics. Every number shown (tutor count, subject counts, open
  slot counts) is computed from records that exist. If there is no data, the copy says
  so rather than inventing a figure.
- Zero testimonials. The only quoted opinions are seeded demo reviews, which appear as
  reviews attached to tutors, labelled behind the demo banner.
- The primary call to action appears **once**, at the bottom, and only for guests.
- No animation beyond a 150-180ms fade on modals and toasts, and all motion respects
  `prefers-reduced-motion`.
- The how-it-works block is text only and explains the request/accept model, which a
  two-sided marketplace genuinely has to explain.

**Concern raised for the PM (not a bug):** the demo banner consumes vertical space
above the fold. At 1440x900 the search card should still be visible, but I could not
confirm this because I have no browser. AC-37 is therefore **unverified**.

---

## 4. Security review

Checks performed by inspection and by test:

| Check | Result |
|---|---|
| Secrets in repository | None found. `.gitignore` excludes `.env*`, `amplify_outputs*.json`, `*.pem`, `*.key`, `.aws/` |
| Hardcoded localhost | None outside the Vite dev-server port |
| Email exposure on public data | **Tested.** No email appears in a public tutor listing payload |
| Plaintext passwords | **Tested.** A registered password does not appear in the persisted demo store |
| Account enumeration | **Tested.** Wrong password and unknown email produce byte-identical messages |
| Authorisation | **Tested.** Non-participants are refused sessions and messages; students cannot accept or complete their own requests |
| Client-side-only enforcement | Route guards are UI only; every invariant is re-checked in the Lambda against Cognito claims |
| Write access from client | Sessions, reviews, messages are client read-only in the AppSync schema |
| XSS | No `dangerouslySetInnerHTML` anywhere; all user content rendered as React text |
| Response headers | HSTS, nosniff, DENY framing, referrer policy and a CSP in `customHttp.yml` |
| Meeting links | Validated as `https://`, and rendered with `rel="noopener noreferrer"` |
| Dependency versions | Pinned by a committed `package-lock.json` |

**Residual risk:** the AppSync API key is public by design so guests can browse. It
grants read-only access to tutor profiles, availability and reviews. This is only
acceptable because no email or private field lives on those models, which is asserted
by a test rather than left to convention.

---

## 5. Not verified — stated explicitly

These cannot be claimed and are not claimed:

1. **No browser was used.** No visual rendering, no layout inspection, no device
   emulation. Consequently:
   - **AC-32** (no horizontal overflow at 320/375/390/414/768/1024/1440) is
     **unverified.** Structural defences are in place (`overflow-x-hidden` on body and
     shell, `min-w-0` on flex children holding text, `break-words` on user content,
     card lists instead of tables) but no measurement was taken.
   - **AC-33** (both journeys completable at 375px) is **unverified.**
   - **AC-34/35/36** (focus management, labels, contrast) were implemented and
     reviewed in code but not tested with a keyboard, a screen reader, or a contrast
     checker. Full WCAG conformance needs manual testing with assistive technology
     and expert review.
   - **AC-37** (search visible without scrolling) is **unverified.**
2. **No AWS deployment.** No credentials were available. Cognito, AppSync, DynamoDB
   and the Lambda have never run. The backend is type-checked and follows documented
   Gen 2 patterns, but "the AWS backend works" is **not** a claim this report makes.
3. **Cross-process booking concurrency (AC-20).** The atomicity guarantee is the
   DynamoDB conditional write, which requires a deployed backend. What is tested is
   the in-tab case and all the surrounding precondition logic.
4. **Email delivery.** The Cognito confirmation-code flow is implemented but no email
   has ever been sent.
5. **`prefers-reduced-motion` and `env(safe-area-inset-*)`** are declared but not
   observed in a real device.

---

## 6. Recommendations to the Project Manager

Ranked. QA does not decide these.

1. **Run the app in a browser and walk both journeys at 375px and 1440px.** This is
   the single largest remaining risk. Roughly a third of the acceptance criteria are
   presentation criteria that no amount of unit testing can close.
2. **Deploy to Amplify once** to prove the backend. Until then AC-42 is
   architectural, not demonstrated.
3. **Allow editing a meeting link after acceptance.** Currently a tutor who accepts
   without a link must cancel and rebook, which is a poor outcome for a common
   mistake.
4. **Reconsider the demo banner's height at 375px** if AC-37 turns out to be tight.
5. **Add a "tutors I have worked with" shortcut** for repeat bookings. Not a bug;
   a genuine convenience gap.
6. **Consider server-side search** before this passes a few hundred tutors.

---

## 7. QA verdict

**Conditional pass.**

- No Critical or High severity defect remains open. BUG-001 (HIGH) is fixed and
  verified by the tests that caught it.
- Every acceptance criterion that is testable without a browser or an AWS account has
  been tested and passes.
- **I cannot sign off AC-32, AC-33, AC-34, AC-35, AC-36, AC-37 or AC-42**, because
  verifying them requires a browser and an AWS deployment that this environment does
  not have. They are not failures; they are untested.

The project should not be declared complete until someone opens it in a browser and
confirms the responsive and accessibility criteria, and deploys the backend once.
