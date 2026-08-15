# Peer Tutoring Platform — UI/UX Design Handoff

**Owner:** UI/UX Designer (Role 2)
**Consumes:** `01-project-requirements.md`
**Audience:** Role 3, Senior Full-Stack Engineer

---

## 1. Design direction

The register is **institutional software, not consumer marketing** — closer to a
well-built university catalogue or a good internal tool than to a startup landing
page. Calm, dense enough to feel substantial, generous with whitespace where
scanning matters.

Three requirements drive the whole design:

- **AC-37** (working search visible without scrolling) rules out the conventional
  full-bleed marketing hero. The landing page is a compact search product, not a
  poster.
- **AC-38** (no fabricated statistics or testimonials) means credibility must come
  from displaying real tutors, real subjects and real open slots. There is no usage
  data to quote, so the design is built not to need any.
- **AC-15** (card and profile must agree) is a design constraint as much as an
  engineering one. One canonical tutor representation is defined, and the card,
  profile header and dashboard row are three *densities* of that single shape.

Deliberately excluded: gradient meshes, floating illustrations, scroll-triggered
reveals, animated counters, parallax. Each costs load time and motion-sickness risk
while telling the user nothing about whether a chemistry tutor is free on Thursday.

## 2. Design tokens

### Colour

Primary is a deep slate-teal rather than default SaaS indigo: it reads academic and
calm, and at 600+ it clears 4.5:1 on white (AC-36).

| Token | Hex | Use |
|---|---|---|
| `primary-50` | `#eef7f7` | Tinted surfaces |
| `primary-100` | `#d3ebeb` | Chips, subtle fills |
| `primary-200` | `#a8d6d7` | Borders on tinted surfaces |
| `primary-300` | `#74baBC` | Decorative only |
| `primary-400` | `#489a9d` | Hover on dark surfaces |
| `primary-500` | `#2d7d80` | Icons on white |
| `primary-600` | `#0f5d5e` | **Primary actions, links** |
| `primary-700` | `#0c4a4b` | Hover |
| `primary-800` | `#0a3c3d` | Active |
| `primary-900` | `#082e2f` | Headings on tint |

Neutrals are warm slate (`ink-50` through `ink-900`) so long reading does not feel
clinical.

Semantic colours carry meaning and nothing else:

| State | Colour | Meaning |
|---|---|---|
| Pending | Amber | Requires someone's action |
| Confirmed | Emerald | Agreed and scheduled |
| Completed | Slate | Finished, terminal |
| Cancelled / Declined | Rose | Ended without a session |

**Amber is reserved exclusively for pending/attention.** If amber is also a
decorative accent it stops meaning "act on this".

### Typography

Inter, with a system fallback stack. Scale: 12 / 14 / 16 / 18 / 20 / 24 / 30 / 36.
Body is **16px minimum on mobile** — 14px body text is the most common mobile
accessibility failure. Line height 1.6 for prose, 1.2 for headings. Weights 400 /
500 / 600 / 700 only.

### Space, radius, elevation

4px base grid. Card padding 16px at mobile, 20-24px at desktop. Radius: 8px for
inputs and buttons, 12px for cards. Nothing is pill-shaped except status badges, so
that shape itself becomes a signal. Elevation is mostly borders (`ink-200`); shadow
is reserved for genuinely floating layers (modals, dropdowns, sheets).

## 3. Page inventory

| Route | Purpose | Access |
|---|---|---|
| `/` | Orientation, live search, real tutor preview, subject browse | Public |
| `/tutors` | Full search: filter rail, sort, results grid, pagination | Public |
| `/tutors/:id` | Canonical tutor profile, availability, reviews, booking | Public; booking gated |
| `/login` | Sign in, returns to intended destination (AC-5) | Public |
| `/register` | Sign up with role selection | Public |
| `/dashboard` | Role-aware overview, action-needed items first | Authenticated |
| `/dashboard/profile` | Identity, tutor profile, subject editor | Authenticated |
| `/dashboard/availability` | Availability slot manager | Tutor only (AC-6) |
| `/dashboard/sessions` | Session list, lifecycle actions, reviews | Authenticated |
| `/dashboard/messages` | Session-scoped conversations | Authenticated |
| `/dashboard/notifications` | Notification history | Authenticated |
| `*` | Not found, with routes back into the product | Public |

## 4. Landing page composition

Above the fold at 1440px, in order:

1. **Header** — wordmark, `Find a tutor`, `Subjects`, `How it works`, `Log in`,
   `Sign up`.
2. **Orientation block, approximately 200px tall.** One `h1` stating plainly what
   the platform does, one supporting sentence naming both audiences. No slogan.
3. **The search card.** Subject select, free text, level, mode, `Search tutors`.
   A real control submitting to `/tutors` with real query parameters (AC-12). This
   is the page's visual centre of gravity.
4. **Subject chip strip** with genuine counts derived from data — a real number or
   no number.

Below the fold: a live grid of real tutor cards, a compact three-step
how-it-works block (text only), and the footer. The three-step block is the single
concession to marketing, justified because a two-sided request/accept model must be
explained before a user will trust it.

Total scroll to see the entire page: about two viewports.

## 5. Component inventory

**Primitives:** Button (primary / secondary / ghost / danger, three sizes, loading
and disabled), IconButton, Input, Textarea with counter, Select, Checkbox, Radio,
RadioCardGroup, Field wrapper (label + hint + error + `aria-describedby`), Card,
Badge, Avatar with initials fallback, Rating (interactive and read-only), Modal,
BottomSheet, Toast, Spinner, Skeleton, EmptyState, ErrorState, Pagination, Tabs,
SectionHeading.

**Domain:** TutorCard, TutorProfileHeader, SubjectChip, FilterRail, FilterSheet,
SortSelect, AvailabilityPicker, AvailabilityEditor, SessionCard, SessionStatusBadge,
BookingModal, ReviewModal, ReviewList, MessageThread, MessageComposer,
NotificationList, StatTile, DemoModeBanner.

The same component must look and behave identically everywhere it appears.

## 6. Responsive specification

Breakpoints: 640 / 768 / 1024 / 1280. **Base styles are mobile**, so mobile can
never be a degraded afterthought of a desktop layout.

| Surface | Mobile (<640) | Tablet (768-1023) | Desktop (>=1024) |
|---|---|---|---|
| Navigation | Hamburger to full-height sheet, 48px targets, focus trapped, Escape closes | Same | Full horizontal bar |
| Dashboard nav | Bottom tab bar (thumb reach) | Bottom tab bar | Left sidebar |
| Filters | `Filters (n)` button to bottom sheet, `Apply` / `Clear` pinned above safe area | Bottom sheet | Persistent left rail |
| Results grid | 1 column | 2 columns | 3 columns at >=1280 |
| Tutor profile | Single column, sticky bottom `Book a session` bar | Single column | Two column, sticky booking sidebar |
| Availability | Cards grouped by date | Cards grouped by date | 7-column week grid |
| Sessions | Stacked cards | Stacked cards | Cards with inline actions |

**There are no data tables.** Every list is a card list that reflows. This satisfies
AC-32 structurally rather than by patching overflow later.

**Overflow discipline (mandatory):** `min-w-0` on every flex child containing text,
`break-words` on all user-generated content, `overflow-x-hidden` on the app shell.
A long unbroken string in a tutor bio is the classic source of 320px overflow.

Verify at 320 / 375 / 390 / 414 / 768 / 1024 / 1440 px.

## 7. Required UI states

Every asynchronous surface implements all five:

1. **Loading** — skeletons matching the final layout, not centred spinners, so
   nothing jumps when data arrives.
2. **Empty** — names the cause and offers the exit. "No tutors match these filters"
   plus a `Clear filters` action.
3. **Error** — states what failed and offers retry. Never a bare "Something went
   wrong".
4. **Success** — toast for background actions, inline confirmation for in-context
   ones.
5. **Conflict** — booking specifically must explain that the slot was just taken and
   refresh the availability view.

**Optimistic UI is prohibited for booking.** Under AC-20 the server is the only
authority on slot ownership; rendering "Booked" before the server agrees would make
the interface lie.

## 8. Accessibility requirements

- Semantic landmarks (`header`, `nav`, `main`, `footer`); exactly one `h1` per page;
  no skipped heading levels.
- Visible 2px focus ring with offset on every focusable element. `outline: none` is
  never used without a replacement indicator.
- Every input has a real associated `<label>`. Errors use `aria-describedby` and
  `role="alert"` (AC-35).
- Modals: `role="dialog"`, `aria-modal="true"`, focus trap, Escape to close, focus
  restored to the trigger (AC-34).
- Status is never conveyed by colour alone; badges pair colour with text.
- Decorative icons are `aria-hidden`; meaningful icons are labelled.
- Star ratings expose a text equivalent: "4.6 out of 5, 12 reviews".
- A polite live region announces result counts after filtering, so screen-reader
  users learn the list changed.
- Skip-to-content link as the first focusable element.
- Minimum 44x44px touch targets on mobile.

## 9. Anti-advertisement checklist (QA should verify against this)

- [ ] Functional search visible without scrolling at 1440px
- [ ] No fabricated statistics anywhere
- [ ] No invented testimonials
- [ ] Primary call-to-action not repeated on the same page
- [ ] Landing page under roughly two viewports of scroll
- [ ] Real data shown rather than described
- [ ] No autoplaying motion
- [ ] Every visible control performs a real action (AC-39)
