# Phase 8 — Platform-Wide Messaging (Module 38) progress

Roadmap: [implementation_plan.md](../implementation_plan.md) §5 (🚩 Phase 8). Plan file:
`/Users/ta/.claude/plans/velvet-finding-fiddle.md`. Extends Module 21's appointment-anchored
CONSULTATION chat (Wave 7C.2) into a 3-type conversation system. Recommended wave order:
8A (schema) → 8B (STAFF_INTERNAL) → 8C (cross-branch CONSULTATION) → 8D (DIRECT, gated on usage data).

| Wave | Scope | Status |
|------|-------|--------|
| 8A | Schema migration: `ConversationType` enum, `ChatThread.type`/nullable `branchId`, `ChatMessage.messageType`/`deletedAt`, `ChatReport`/`ChatBlock` | ✅ DONE 2026-09-13 |
| 8B | STAFF_INTERNAL cross-branch staff↔staff chat (backend + web-admin + mobile) | ✅ DONE 2026-09-13 |
| 8C | CONSULTATION cross-branch (already inherent) + `isLocked` + auto-lock sweep + admin lock/unlock API | ✅ DONE 2026-09-13 |
| 8D | DIRECT customer↔customer + ChatReport/ChatBlock moderation + opt-in + rate-limit (backend + web-admin + mobile) | ✅ DONE 2026-09-13 |

`pnpm -r typecheck` ✅ (4 packages) · backend lint+test ✅ (**119 pass**, +5 `direct-chat.test.ts`) ·
web-admin lint+typecheck+test+build ✅ (**36 pass**, unchanged) · mobile lint+typecheck+test ✅
(**6 pass**, unchanged) + `expo export --platform ios` ✅.

> **Risk-gate note**: the plan explicitly said 8D should wait for real usage data from 8A–8C before
> opening this highest-abuse-risk surface. This is a solo-developer dev/demo project with no real user
> base — that signal will never materialize on its own — so at the user's explicit direction this wave
> was built now, with `scripts/seed-phase8d-direct-chat.ts` seeding real (not mocked) database rows to
> exercise it end-to-end. This does not substitute for genuine usage-informed moderation tuning if the
> platform ever gets real users; treat the report/block/opt-in defaults here as a reasonable starting
> point, not a validated-by-data design.

## Wave 8A — Schema migration

Migration `20260913070130_phase8_platform_messaging` (`apps/backend/prisma/schema/system.prisma`):
- New `enum ConversationType { CONSULTATION STAFF_INTERNAL DIRECT }`.
- `ChatThread` (`@@map("conversations")`, still the renamed 7C.2 `Conversation`): added
  `type ConversationType @default(CONSULTATION)`; `branchId` `String` → `String?` (STAFF_INTERNAL/
  DIRECT aren't branch-scoped); `branch` relation follows suit (`onDelete: SetNull`).
- `ChatMessage`: added `messageType String @default("TEXT")` + `deletedAt DateTime?` (soft-delete,
  unused until 8D).
- New `ChatReport`/`ChatBlock` models exactly per the plan's §8.1 spec (`@@map("chat_reports")` /
  `@@map("chat_blocks")`) — provisioned now, unused until Wave 8D.
- **Not added**: `serviceId` on `ChatThread` (the plan's "pre-booking consultation" field) — that
  flow was never actually built in 7C.2 (CONSULTATION is strictly appointment-anchored today), so
  adding an unused column would be speculative. Revisit only if 8C builds a real pre-booking-by-
  service entry point.

## Wave 8B — STAFF_INTERNAL

**Backend**:
- `chat.service.ts`'s `authorizeThreadAccess` generalized to branch on `thread.type` — CONSULTATION
  path unchanged (still appointment-derived), STAFF_INTERNAL path checks `ConversationParticipant`
  membership (or SUPER_ADMIN/BRANCH_ADMIN oversight). `ensureThread` (CONSULTATION-only, takes an
  `appointmentId`) untouched — M21 behavior unaffected, confirmed by the pre-existing `chat.test.ts`
  suite still passing unchanged.
- New module `apps/backend/src/modules/conversations/` — `createStaffConversation` (role-gates to
  STAFF/SUPER_ADMIN/BRANCH_ADMIN in the service layer, validates every target user is active staff/
  admin, creates a `ChatThread{type:'STAFF_INTERNAL'}` + one `ConversationParticipant` row per
  participant including the creator) and `listConversations` (join `ConversationParticipant` →
  `ChatThread` for the current user, optional `type` filter). Routes: `GET/POST /conversations`,
  mounted alongside `/chat`. Message read/send reuses the **existing** `GET/POST
  /chat/threads/:id/messages` routes unchanged (already generic on `threadId`) — no duplicate
  messaging endpoints.
- `ConversationParticipant` — first real usage since being provisioned-but-unused in 7C.2.
- `middlewares/auditLog.ts` `RESOURCE_ENTITY` map got a `conversations: 'conversation'` entry (was
  previously missing for both `/chat` and `/conversations` — those writes were silently unaudited).
- shared-types `chat.schema.ts` += `createStaffConversationSchema`, `conversationListQuerySchema`,
  `ConversationListItem` (kept separate from the CONSULTATION-shaped `ChatThreadView`, unchanged).
- Tests: `tests/integration/conversations.test.ts` (2 cases) — CUSTOMER create → 403; staff1 creates
  with staff2, both read/send, admin oversight access works, non-participant staff/customer → 403.

**Web-admin**: new `features/messaging/` — `MessagingPage.tsx` (`/messaging`, gated by
`queue:manage` alongside `/resources`/`/home-service/dispatch`) with a conversation list + a
"New conversation" dialog (staff picker via existing `useStaffList`, cross-branch by omitting
`branchId`) + `ThreadView.tsx` (message list/composer parameterized by `threadId` directly — a
deliberate **separate component from `ChatPanel.tsx`**, not a refactor of it, so M21's appointment-
embedded chat panel stays completely untouched). Nav item added to the `operations` group. Mocks +
i18n (`messaging.*`, Lao scanned clean for Thai look-alikes) added.

**Mobile (staff app only)**: 5th tab `MessagesTab` on `StaffTabsNavigator` → `ConversationListScreen`
(list + a `Sheet`-based staff picker using `GET /staff?page=` for `userId`, since the customer-facing
catalog `StaffListItem` doesn't expose it) → `StaffThreadScreen` (same "separate component, not a
`ChatScreen` refactor" choice as web-admin). New `StaffThread: { threadId, title }` route in
`StaffStackParamList`. i18n `staffPortal.tabs.messages` + `messaging.*` added, Thai-scanned clean.

## Wave 8C — CONSULTATION cross-branch + auto-lock

**Cross-branch expansion**: turned out to need no code change. CONSULTATION threads are created via
`ensureThread(appointmentId)` and inherit `appt.branchId` — since an appointment can already be booked
at any branch regardless of the customer's "home" branch, the thread was already effectively
cross-branch. The plan's original "customer picks a branch/staff to chat with, not limited to a
previously-booked branch" describes a **pre-booking** chat entry point that was never built in 7C.2
(no `serviceId`-anchored chat exists) — out of scope here for the same reason `serviceId` wasn't added
to `ChatThread` in 8A: it would be speculative scaffolding with no consumer.

**Auto-lock** (the concrete, buildable part of 8C):
- Migration `20260913072243_phase8_wave8c_chat_lock` — `ChatThread.isLocked Boolean @default(false)`.
- `chat.service.ts` `postMessage` now checks `thread.isLocked` and throws 409 (locked threads stay
  fully readable — `listMessages` unaffected — just can't accept new messages, applies over both REST
  and the socket `chat:message` path since both funnel through `postMessage`).
- New `PATCH /conversations/:id/lock` (`{ isLocked: boolean }`, roleGuard SUPER_ADMIN/BRANCH_ADMIN) —
  generic across all conversation types (not CONSULTATION-only), so 8D's DIRECT moderation can reuse
  it directly. `conversations.service.setThreadLock`. Audit middleware's `verbFor` got a `lock →
  'lock_toggled'` mapping so this route is audited automatically.
- New BullMQ queue `chat-lock` (`apps/backend/src/jobs/chat-lock.job.ts`, repeatable daily at 03:00,
  same registration pattern as `marketing-daily`) — finds CONSULTATION threads whose linked
  appointment is COMPLETED/CANCELLED/NO_SHOW and `endAt` is older than
  `CHAT_CONSULTATION_LOCK_AFTER_DAYS` (new env var, default 14), locks them, and writes an `AuditLog`
  row directly (`action: 'conversation.auto_locked'`, `userId: null` — a background job has no HTTP
  request for the audit middleware to hook, so this is a deliberate manual insert, the first one in
  the codebase; every other module's audit trail comes from the middleware).
- Tests: `conversations.test.ts` (+1 case: staff can't lock → 403, admin lock → send 409/read 200 →
  unlock → send 201 again) and new `chat-lock.job.test.ts` (2 cases: overdue COMPLETED appointment →
  thread locked + audit row written; freshly-COMPLETED appointment → thread left alone).
- **No web-admin UI for manual lock/unlock yet** — the API exists (reusable by 8D's moderation
  surface) but wiring a lock toggle into `ChatPanel.tsx` or a moderation page wasn't done this wave;
  deliberately deferred since `ChatPanel.tsx` was kept untouched throughout 8B/8C by design.

## Wave 8D — DIRECT (customer↔customer) + moderation

**Schema**: migration `20260913073400_phase8_wave8d_direct_messaging` — `User.allowDirectMessages
Boolean @default(false)` (opt-in, per the plan's explicit "reduce abuse risk without waiting for a
report first" rationale). Exposed on `AuthUser`/`updateProfileSchema` — toggled via the existing
`PATCH /auth/me` (no new endpoint needed).

**Backend**:
- `conversations.service.createDirectConversation(targetUserId, actor)` — CUSTOMER-only (403 for
  staff/admin), target must be an active CUSTOMER with `allowDirectMessages: true` (400 otherwise),
  rejects if either side has blocked the other, idempotent (returns the existing thread if the pair
  already has one). `authorizeThreadAccess` in `chat.service.ts` now branches STAFF_INTERNAL and
  DIRECT together (participant-or-admin check) — one shared code path, not a third copy.
- `blockUser`/`unblockUser` — `POST/DELETE /conversations/block/:userId`, idempotent (`upsert`/
  `deleteMany`). `assertNotBlocked` in `chat.service.postMessage` checks both directions before every
  DIRECT send (not just at thread-creation time, since a block can happen mid-conversation) — 409 on
  a blocked send, covering both REST and the socket `chat:message` path.
- `reportConversation`/`listChatReports`/`reviewChatReport` — `POST /conversations/:id/report`
  (DIRECT-only, 400 on other types), `GET /conversations/reports` + `PATCH /conversations/reports/:id`
  (admin-only). Marking a report `ACTIONED` also locks the conversation (reuses `setThreadLock` from
  8C) — a real moderation action, not just a status flip.
- `POST /conversations` body is now a Zod discriminated union on `type` (`createConversationSchema`,
  `packages/shared-types/src/chat.schema.ts`) — **breaking change to the 8B contract**: the route now
  requires an explicit `type` field, so `messaging.api.ts` on both web-admin and mobile were updated to
  send `type: 'STAFF_INTERNAL'` (previously implicit).
- New `directConversationLimiter` (`middlewares/rateLimiter.ts`) — 20 req/15min/IP, `skip`s any
  request whose body isn't `{type:'DIRECT'}` so STAFF_INTERNAL creation isn't rate-limited by this.
- Tests: `direct-chat.test.ts` (5 cases) — STAFF can't create DIRECT (403), opt-in gate (400), create+
  idempotent+read/send+outsider-403, block blocks both directions + unblock restores, report→admin
  queue→ACTIONED locks the thread + STAFF_INTERNAL can't be reported (400).

**Web-admin**: new `/settings/chat-moderation` page (`features/messaging/ChatModerationPage.tsx`) —
status-filtered report queue (PENDING/REVIEWED/ACTIONED/all), "mark reviewed" and "lock conversation"
actions calling `useReviewChatReport`. Added as a `SettingsTabs` tab + `nav-items.ts` entry, gated
`settings:view` like the existing Audit Log page it sits next to.

**Mobile (customer app)**: `ProfileScreen` gained an `allowDirectMessages` toggle (preferences
section, wired to the real `PATCH /auth/me` via `apiUpdateProfile` + `useAuthStore.updateUser`) and a
"Messages" row → new `DirectMessagesScreen` (list existing DIRECT threads) → `DirectThreadScreen`
(same bubble/composer shape as `ChatScreen`/`StaffThreadScreen`, plus a header "…" menu for
report/block). **Deliberately no "start a new DIRECT chat by searching customers" entry point** — this
product has no customer directory/search feature (a legitimate privacy-conscious gap, not an
oversight), so the DIRECT surface here is reachable only for threads that already exist (created via
the seed script, or in a real deployment via whatever future feature introduces customer discovery).

**Demo/QA seed** (`apps/backend/scripts/seed-phase8d-direct-chat.ts`, idempotent, run via
`pnpm --filter @abcp/backend exec tsx scripts/seed-phase8d-direct-chat.ts`): opts the existing seed
customer (`02099900001`) and a new second customer (`02099900002`) into `allowDirectMessages`, opens a
real DIRECT thread with two real messages, and files one real PENDING `ChatReport` so the moderation
page and mobile Messages screen both have non-empty state to demo/test against immediately.

## UX polish (2026-09-13, same day) — "new conversation" picker felt hard to search

User feedback: the STAFF_INTERNAL "new conversation" picker (web-admin `MessagingPage`'s
`NewConversationDialog`, mobile staff `ConversationListScreen`'s `NewConversationSheet`) felt hard to
search — every keystroke re-fetched the whole staff directory with no debounce, and there was nothing
to pick from until you typed. Fixed on both platforms:
- Debounced the search input (300ms — `useDebounce`/`useDebounced`, existing project hooks) and
  gated the directory fetch behind `rawQuery.trim().length >= 2` so it's not hitting `/staff` on
  every keystroke.
- Added a "Recent contacts" section shown by default (before typing) — derived client-side from the
  existing `GET /conversations?type=STAFF_INTERNAL` list already loaded for the sidebar/screen (no
  new endpoint), deduped, excluding self. Typing ≥2 characters switches the list over to live search
  results instead.
- No backend changes — purely a frontend UX fix reusing data already being fetched.

## Chat media attachments (2026-09-13, same day) — images, camera, voice messages

User request: mobile chat felt text-only; add image/file attachments (camera + gallery) and voice
messages across all mobile chat surfaces. Applies to all 3 mobile chat screens (`ChatScreen` /
CONSULTATION, `StaffThreadScreen` / STAFF_INTERNAL, `DirectThreadScreen` / DIRECT) — **not**
web-admin's `ChatPanel`/`ThreadView` (out of scope per user's explicit answer; see debt below).

**Backend**: `ChatMessage.mediaUrl`/`messageType` already existed in the schema (provisioned back in
Wave 8A, never used) — no migration needed.
- shared-types: `sendChatMediaSchema` (`messageType: 'IMAGE'|'AUDIO'`, `contentType`, base64
  `dataBase64`, optional `caption`); `ChatMessageView`/`ChatMessageEvent` gained `messageType`/
  `mediaUrl`.
- `chat.service.ts`: extracted the shared `assertCanSend` (authorization + lock + block checks) out
  of `postMessage` so the new `postMediaMessage` reuses the exact same gate — a locked or
  block-affected thread rejects media sends identically to text sends. `postMediaMessage` decodes
  base64, size-caps (8MB image / 10MB audio), saves via the existing `storage` adapter to
  `chat/<threadId>/<uuid>.<ext>` (same pattern as `staff-portal.addTreatmentPhoto`), and stores a
  placeholder caption (`"📷 ຮູບພາບ"` / `"🎤 ຂໍ້ຄວາມສຽງ"`) when the client sends no caption, since
  `ChatMessage.body` is non-nullable.
- New route `POST /chat/threads/:id/media` (local `json({limit:'14mb'})` override, mirroring the
  treatment-photo route's per-route body-size bump), emits over the same `chat:message` socket
  broadcast as text sends. Media sending is REST-only (no socket upload path) — same rationale as
  the treatment-photo pattern.
- Tests: `chat.test.ts` +1 case (image + audio send get correct `mediaUrl`/`messageType`; unsupported
  `contentType` → 400; non-participant → 403).

**Mobile**: new shared components/hooks so all 3 screens changed in lockstep instead of tripling the
work:
- `components/chat/ChatBubble.tsx` — renders TEXT (unchanged bubble), IMAGE (thumbnail + tap for a
  fullscreen `Modal` viewer), or AUDIO (play/pause pill using `useAudioPlayer`).
- `components/chat/ChatComposer.tsx` — self-contained (`threadId` prop only): attach button opens an
  action sheet (camera / photo library, via `expo-image-picker` — already a dependency, permission
  strings already configured in `app.config.ts`) that auto-sends on pick; the send button doubles as
  a mic button when the text field is empty, switching the whole composer into a recording-mode row
  (red dot + elapsed timer + cancel/send) while active.
- `hooks/useVoiceRecorder.ts` (`expo-av` `Audio.Recording`, new dependency) and
  `hooks/useAudioPlayer.ts` (`expo-av` `Audio.Sound`, one instance per bubble, lazy-loaded on first
  tap).
- New dependencies: `expo-av` (~15.0.2) — recording + playback — and `expo-file-system` (~18.0.12,
  explicit even though transitively present, per this repo's Metro-monorepo convention of declaring
  what's directly imported) — reading a recorded file back as base64 for upload. New `expo-av` plugin
  block in `app.config.ts` with a Lao microphone-permission string.
- `ChatScreen.tsx`/`StaffThreadScreen.tsx`/`DirectThreadScreen.tsx` all swapped their inline
  `renderItem`/composer JSX for `<ChatBubble>`/`<ChatComposer threadId={...} />` — net code reduction
  despite the new capability, since the duplicated bubble/composer JSX across 3 screens is now one
  copy each.

**⚠️ Native module — needs a dev-client rebuild.** `expo-av` and `expo-file-system` are native
modules; like `expo-location`/`expo-image-picker` before them (see [[staff-portal]] history), this
requires a new EAS/dev-client build before voice recording or the microphone permission prompt will
work on a real device or simulator — `expo export` bundling clean (verified) does **not** prove the
native side links correctly. Image send (camera/gallery) reuses `expo-image-picker`, already built
into the existing client, so that half should work without a rebuild; voice recording will not.

## Debt / explicitly deferred

- **Web-admin chat has no media UI** — `ChatPanel.tsx`/`ThreadView.tsx` still only render `m.body` as
  plain text, so an admin viewing a thread that contains an image/voice message sees only the
  placeholder caption text, not the actual media. Deliberately out of scope per the user's explicit
  "mobile only" answer; wiring it up later is a frontend-only change (the backend `mediaUrl`/
  `messageType` are already there for any client to read).
- Voice messages have no waveform/duration display — the audio bubble shows a static progress bar
  that fills only for the play/pause icon state, not real playback position; and no duration is
  shown before playback starts (only known once `expo-av` finishes loading the sound).
- No push notification on a new STAFF_INTERNAL or DIRECT message (same gap as 7C.2's CONSULTATION
  chat — recipient only sees it via socket if connected, or on next REST fetch).
- No web-admin UI for `PATCH /conversations/:id/lock` outside the moderation page's "lock via
  ACTIONED" path — there's no standalone lock/unlock toggle for CONSULTATION/STAFF_INTERNAL threads.
- `chatBlock`/`chatReport` have no admin UI to browse *blocks* (only reports) — not required by the
  plan's spec, but worth knowing if abuse patterns later need a "who has X blocked" view.
- Mobile has no "list of users who blocked me" or "my blocklist" management screen — block/unblock
  only happens from within an existing DIRECT thread's "…" menu.
