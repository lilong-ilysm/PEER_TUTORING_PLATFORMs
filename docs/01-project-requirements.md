# Peer Tutoring Platform — Project Requirements

**Owner:** Project Manager (Role 1)
**Status:** Baseline v1.0 — authoritative scope document
**Repository:** `lilong-ilysm/PEER_TUTORING_PLATFORMs`

> Note on provenance: the requirements supplied to the team contained an unfilled
> placeholder. This document derives the official requirements from the project
> brief. If a separate requirements document is supplied later, scope will be
> re-baselined at the next PM iteration.

---

## 1. Objective

Students who need academic help and students capable of providing it already exist
inside the same institution, but they cannot find each other reliably. Discovery is
word-of-mouth, availability is unknown, and scheduling degrades into message threads.

The platform solves three problems: **discovery**, **scheduling**, and
**accountability** for peer tutoring inside an academic community.

Explicit non-goals: it is not a payments marketplace and not a video-conferencing
product.

## 2. Users

| Role | Description |
|---|---|
| **Student (learner)** | Searches, compares, books, attends and reviews sessions. |
| **Tutor (peer)** | Publishes a tutoring profile, manages availability, accepts or declines requests, completes sessions. |

A single account may hold **both** roles simultaneously. This is the defining
property of peer tutoring: today's learner is tomorrow's tutor. One account, two
capabilities — not two accounts.

**Administrator is rejected from v1.** A moderation console serves the operator,
not the two users being validated, and no core journey depends on it. Deferred to
the optional tier.

## 3. Feature scope

### CORE (mandatory for completion)

| Feature | Justification | Primary user |
|---|---|---|
| Register / login / logout | Bookings require a durable identity | Both |
| Role selection (learner / tutor / both) | Drives dashboards and every permission decision | Both |
| Student profile | A tutor accepting a request must know who they are meeting | Both |
| Tutor profile (bio, subjects, levels, mode, rate) | The unit of comparison; discovery is impossible without it | Tutor authors / student reads |
| Subject catalogue | Search requires controlled vocabulary | Both |
| Tutor search, filtering, sorting | The primary job-to-be-done | Student |
| Availability management | The brief requires genuine availability support | Tutor |
| Booking request → accept / decline | The product's conversion event | Both |
| Server-enforced double-booking prevention | A booking system that double-books is broken, not incomplete | System |
| Cancellation | Real schedules change; without it the data rots | Both |
| Session completion | Gates reviews and keeps history truthful | Both |
| Reviews and ratings, post-completion only | Trust signal for the next student; unearned reviews are noise | Student writes / all read |
| Role-aware dashboards | Both journeys need a home surfacing pending items | Both |

### SHOULD (important, planned for v1 if core is stable)

| Feature | Justification |
|---|---|
| Session-scoped messaging | Coordination detail currently escapes the product |
| In-app notifications | A request nobody sees is a dead request |
| Session history | Falls out of session records at near-zero cost |

### OPTIONAL (deferred)

Admin/moderation console · recurring availability templates · email and push
notifications (requires SES identity verification and deliverability work) ·
calendar (ICS / Google) sync.

### REJECTED (must not be built)

| Feature | Reason |
|---|---|
| Payments / escrow | In-institution peer tutoring is unpaid or settled offline. Adds PCI and compliance burden for zero validation value. |
| Built-in video calling | Duplicates Zoom / Teams / Meet at enormous cost. Store a meeting link instead. |
| Gamification, badges, social feed | Feature creep that distracts from booking. |
| File sharing / collaborative whiteboard | Out of scope for v1. |

**Scope note on `rate`:** the field is retained because peer tutors legitimately
differ (volunteer vs. paid offline) and students filter on it. Retaining the
*field* does not authorise building a *payment system*.

## 4. User journeys

### Student
```
Landing (search present on the first screen, above any marketing)
  -> Search / filter tutors (subject, level, mode, rating, max rate, weekday)
  -> Compare tutor cards
  -> Open tutor profile: bio, subjects, rating, real reviews
  -> View availability (only genuinely open slots)
  -> Request session (slot + topic + optional note)
  -> PENDING -> notified on the tutor's decision
  -> CONFIRMED -> coordinate through session messages
  -> Attend -> tutor marks COMPLETED
  -> Leave exactly one review -> feeds the tutor's public rating
```

### Tutor
```
Landing -> Register (choose to tutor now, or add the capability later)
  -> Complete tutor profile (bio, rate, session mode, levels)
  -> Add subjects taught
  -> Publish availability slots
  -> Become discoverable in search
  -> Receive request (dashboard + notification)
  -> Accept (slot locks atomically) or Decline (slot reopens)
  -> Conduct session -> mark COMPLETED
  -> Receive review -> rating aggregates onto the profile
```

### Guest
```
Landing -> browse and search tutors freely -> open a tutor profile
  -> attempt to book -> prompted to sign in -> returned to the same slot
```
Discovery is public; commitment requires an account. Forcing registration before a
guest can see a single tutor kills adoption.

## 5. Acceptance criteria

Binary and measurable. These are the completion gate.

### Authentication and authorisation
- **AC-1** A visitor can register with name, email, password and at least one role; the account persists and can log in afterwards.
- **AC-2** Registering with an email already in use is rejected with a specific, non-generic message.
- **AC-3** A password under 8 characters, or lacking a letter and a number, is rejected on the client and on the server.
- **AC-4** Login with an incorrect password fails without revealing whether the email exists.
- **AC-5** Requesting `/dashboard/*` while unauthenticated redirects to login, and after login lands on the originally requested URL.
- **AC-6** A learner-only account cannot reach tutor-only screens by typing the URL.
- **AC-7** Logout clears the session; the back button does not restore authenticated content.

### Discovery
- **AC-8** A student can search by subject and sees only tutors who teach that subject.
- **AC-9** Filters for subject, level, session mode, minimum rating, maximum rate and available weekday each work, and combine as AND.
- **AC-10** Sorting by rating, rate (ascending and descending) and review count reorders results correctly.
- **AC-11** A search with no matches shows an explicit empty state offering to clear filters, never a blank page.
- **AC-12** Active filters are reflected in the URL and survive reload and link sharing.
- **AC-13** Only tutors with a published profile **and** at least one subject appear in results.

### Tutor profile
- **AC-14** A profile shows name, bio, subjects with levels, mode, rate, aggregate rating, review count and availability.
- **AC-15** Rating, rate and subjects on the card equal those on the profile for the same tutor, and the aggregate rating equals the mean of that tutor's visible reviews.
- **AC-16** A tutor with no reviews shows "No reviews yet" and is excluded from rating filters rather than treated as zero stars.

### Availability and booking
- **AC-17** A tutor can create, view and delete availability slots; deletion is blocked while a slot has a pending or confirmed booking.
- **AC-18** Past slots are never offered as bookable.
- **AC-19** Booking a slot creates a PENDING session visible to both parties.
- **AC-20** Two concurrent booking or accept attempts on the same slot produce exactly one confirmed session; the second fails with a clear conflict message. **Enforcement is server-side.**
- **AC-21** A student cannot hold two active requests for the same slot.
- **AC-22** Cancelling a pending or confirmed session releases the slot back to bookable.
- **AC-23** State transitions are enforced server-side: PENDING to CONFIRMED / DECLINED / CANCELLED, CONFIRMED to COMPLETED / CANCELLED. COMPLETED and CANCELLED are terminal.
- **AC-24** Only the tutor may accept, decline or complete; only a participant may cancel.

### Reviews
- **AC-25** A review can only be created by the student of a COMPLETED session.
- **AC-26** A second review for the same session is rejected.
- **AC-27** A rating of 1-5 is required; the comment is length-validated.
- **AC-28** A published review appears on the tutor's profile and immediately updates the aggregate rating and count everywhere.

### Messaging and notifications (SHOULD tier)
- **AC-29** Both participants of a non-pending session can exchange messages; non-participants can neither read nor post, enforced server-side.
- **AC-30** Empty or whitespace-only messages are rejected; over-long messages are rejected with a visible counter.
- **AC-31** Booking, accept, decline, cancel, complete, review and new-message events each generate an in-app notification for the counterparty, with an unread count.

### Responsive and accessible
- **AC-32** No horizontal overflow at 320, 375, 390, 414, 768, 1024 and 1440 px on any page.
- **AC-33** The complete student journey and the complete tutor journey are both completable at 375 px.
- **AC-34** Every interactive control is keyboard reachable with a visible focus indicator; modals trap focus and close on Escape.
- **AC-35** Every input has a programmatically associated label; errors are announced to assistive technology.
- **AC-36** Body and interactive text meet WCAG AA contrast (4.5:1).

### Product character
- **AC-37** At 1440 px the landing page shows a functional tutor search control without scrolling.
- **AC-38** The landing page contains no fabricated statistics, no invented testimonials and no duplicated primary call-to-action.
- **AC-39** No control appears interactive unless it performs a real action.

### Engineering and delivery
- **AC-40** `npm run build` completes with no build errors and no TypeScript errors.
- **AC-41** No hardcoded `localhost` URL and no committed secret exists in the repository.
- **AC-42** The repository contains an Amplify-compatible build specification, setup documentation, and a backend defined as code.
- **AC-43** Any demo or local data mode is visibly and permanently labelled in the UI, so it cannot be mistaken for production persistence.

## 6. Environment constraint on AC-43

The build environment has no AWS credentials. The engineer is therefore directed to
deliver:

1. The **real** AWS Amplify Gen 2 backend as the production path — Cognito for
   authentication, AppSync and DynamoDB for data, and a Lambda performing an atomic
   conditional write to enforce AC-20.
2. An **explicitly labelled** local persistence mode so every journey can be
   exercised without an AWS account.

Labelled honestly, (2) is a development affordance. Unlabelled, it would be a
placeholder disguised as finished functionality, which the brief forbids.

No claim of successful AWS deployment may be made unless a deployment is actually
performed and verified.

## 7. Scope authority

New suggestions from UI/UX or QA are triaged by the Project Manager into MUST FIX,
SHOULD FIX, OPTIONAL or REJECT. Rejected items must not be implemented. Anything in
the REJECTED table above stays out regardless of who proposes it.
