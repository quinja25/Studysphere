# StudySphere UX Flows

Complete user experience flows referencing actual component names and routes.

---

## Flow 1: First-Time Visitor

**Entry point:** `/` renders `<Waitlist />`

- Dark landing page with animated glow effect and animated waitlist counter (`CountUp` component)
- Signup card fields: email, role (Student / Alumni / Other), curriculum dropdown
- On submit: shows "You're on the list!" confirmation with queue position and "Try the AI now" CTA
- `<LiveStatsStrip />` fetches `GET /public/stats` every 60s and displays real-time platform stats
- `<TryAiWidget />`: 3 pre-set IB question chips, 200-character free text input, posts to `POST /public/ai-try` (rate-limited to 3/day per IP)
- Page also includes features section, testimonials block, and bottom CTA

**Alternate landing:** `/home` (`Home.js`) — post-launch marketing page with "Get Started Free" CTA that navigates to `/registration`

**Known issue:** `/for-mentors` is referenced in the nav but no route exists — results in 404.

---

## Flow 2: Registration → First Session

**Route:** `/registration`

- Form fields: name, email, username, password, role (student / alumni)
- Google OAuth pre-fill: if arriving via Google login, name/email/picture are pre-populated and the password field is hidden
- Role-conditional fields:
  - Student: target university, curriculum, major
  - Alumni: university
- Subject picker: typeahead search over IB subjects with SL / HL level toggle buttons
- On submit: `POST /users/register` → stores `userData` in `localStorage` → navigates to `/lobby`

**Lobby (`Lobby.js`):**
- Welcome message with streak reminder
- "Create Study Room" and "Find Study Room" action buttons
- Your Study Rooms grid — filters out DM groups (`__dm_*` naming pattern)

**Known gaps:**
- No onboarding flow after registration — user lands on an empty lobby with no guidance
- Email verification banner only appears on `/dashboard`, not in the lobby

---

## Flow 3: AI Chat (Standalone)

**Route:** `/ai-chat` renders `<AiChat />`

**Left sidebar:**
- Credits bar showing daily usage against the 50k token limit
- Subject focus pills to scope retrieval
- "My Documents" list with inline upload form

**Document upload:** title, subject, doc type (Textbook / Past Paper / Notes / Other), PDF file picker → `POST /ai/upload-document`

**Conversation area:**
- Empty state: "What would you like to know?" with 5 quick-action cards
- Messages rendered via `MarkdownContent` component
- Per-message controls: thumbs up / thumbs down, copy button
- Expandable sources panel per message — type badges (Wiki, Q&A, Post, Resource, Your Doc) with color coding

**Quiz mode:**
- Topic + difficulty inputs → `POST /ai/quiz` → 3 MCQ cards → score ring display

**API behavior:**
- Uses `POST /ai/ask` (stateless — full history sent from client on each request)
- Feedback posted via `POST /ai/feedback` with `queryText`, `rating`, and `clickedSources`

**Known issue:** Quiz requests from standalone AI Chat do not include a `groupId`, causing a 400 error.

---

## Flow 4: Study Room

**Route:** `/group/:id` renders `<Group />`

**On join:**
- WebRTC connection established
- Session goal modal prompts "What do you want to accomplish?"

**Video area:**
- Local and remote participant tiles
- Grid layout adapts automatically to participant count

**Controls bar:**
- Mic toggle, camera toggle, screen share, chat, whiteboard, AI assistant, ambient sound, fullscreen, leave

**Chat sidebar:**
- Real-time Socket.io messaging
- Pin and delete message actions

**Whiteboard sidebar:**
- Shared drawing canvas, state synced via Socket.io

**AI Assistant sidebar (`<AiAssistant />`):**
- Uses `POST /ai/chat` (stateful — history stored in `AiMessages` table, requires `groupId`)
- Loads conversation history from `GET /ai/history/:groupId`
- Has its own document upload panel (same flow as standalone AI Chat)
- Same thumbs feedback controls as `<AiChat />`

**Pomodoro timer:**
- Room leader controls focus / break modes
- Timer state synced to all participants via Socket.io

**Leave flow:**
1. XP calculation: 10 XP/min + 25 XP goal completion bonus
2. `PUT /users/updateXP/:id`
3. Exit modal displays session stats
4. `POST /recaps/generate` auto-creates session recap
5. `sendBeacon` fallback saves XP if the tab closes unexpectedly

---

## Flow 5: Document Upload

**Available from:** AI Chat left sidebar and Study Room AI Assistant sidebar

**Form fields:** title, subject (IB subject optgroups), doc type, PDF file picker

**On success:**
- Document appears in the list with type badge, page count, and chunk count
- Immediately active in RAG retrieval

**RAG impact:**
- +0.3 similarity boost applied pre-RRF in `vectorSearch()`
- +0.025 personalization boost applied post-RRF in `retrieveContext()`
- "Your Doc" badge shown in the sources panel when the document is cited

**Delete:** triggers `ConfirmModal` before calling `DELETE /ai/documents/:id`

---

## Flow 6: Q&A / Wiki / Resources

### Q&A (`/qa`)
- Search bar, subject filter, question list with answer-count and accepted-answer badges
- "Ask a Question" requires authentication
- Answer actions: voting (all users), accept answer (question author only), alumni author badge
- AI Suggest button pre-fills a related AI query

### Wiki (`/wiki`)
- Search bar, subject filter, article list
- "New Article" restricted to alumni role
- Edit and delete restricted to the article author
- **Known gap:** article content renders as plain text — no Markdown support

### Marketplace (`/marketplace`)
- XP balance displayed in header; shown in red when in debt
- Type filter tabs (tabs, not text search)
- Resource cards with unlock and borrow mechanic
- Borrow action allows negative XP balance (XP debt)
- **Known gap:** no text search on the Marketplace

---

## Flow 7: Dashboard

**Route:** `/dashboard` renders `<Dashboard />`

**Profile header:**
- Avatar, name, role badge, verified badge, social links (LinkedIn, GitHub, website)
- Inline edit mode for profile fields

**Stats sidebar:**
- Level, XP progress, current streak, total sessions

**Email verification banner:**
- Only displayed on `/dashboard` — this is the sole location in the app

**Tabs:**
- **Profile:** about text, subjects list, quick action buttons
- **Study Stats:** streak card, weekly goal ring (target: `weeklyGoalMinutes`, default 120)
- **My Groups:** list of joined study rooms
- **Session Recaps:** past session summaries from `SessionRecaps` table

**Known dead links:**
- "Find Peers & Mentors" button → `/search-alumni` (route does not exist)
- "View Public Profile" button for alumni → `/alumni/:id` (route does not exist)

---

## Flow 8: Admin Dashboard

**Route:** `/admin` — protected by `AdminRoute` which calls `GET /admin/dashboard` and redirects if the user is not admin

**Overview tab:**
- Total user count, trust score distribution bar, recent `TrustEvents` log

**Reports tab:**
- Filter by status (pending / reviewed / dismissed / actioned)
- Action or dismiss each report with a trust penalty slider
- Actions write to `TrustEvents` and update the reported user's `trustScore`

**Users tab:**
- Search by name / email
- Table with trust scores, ban / unban controls
- Modal to view full trust event history and report history per user

**Documents tab:**
- Upload global PDFs to the admin library (`POST /admin/documents`)
- Document table with title, subject, curriculum, chunk count
- Delete removes document and associated `ContentEmbeddings` rows

---

## Supporting Flows

### Authentication

**Login (`/login`):**
- Email + password form or Google OAuth button
- Google OAuth 404 response → redirects to `/registration` with Google profile pre-filled

**Forgot / Reset Password:**
- `/forgot-password` → email input → sends reset token
- `/reset-password?token=` → new password form → on success auto-redirects to `/login`

**Email Verification (`/verify-email?token=`):**
- Auto-verifies on component mount
- Displays success or error state

### Chat / DMs (`/chat`)
- Left sidebar: Study Rooms tab and Direct Messages tab
- DM rooms named with `__dm_{minId}_{maxId}` convention
- Real-time Socket.io messaging, pin and delete message actions

### Schedule (`/schedule`)
- Google Calendar OAuth flow to grant calendar access
- Displays existing calendar events and allows creating new study sessions
- Client-side only — no backend calendar storage

### NavBar
- Context-aware: different links shown for logged-in vs logged-out state
- Admin link visible only when `isAdmin` is set in `localStorage.userData`
- `<NotificationBell />` shows unread badge count

### Notifications
- Real-time delivery via Socket.io event `notification:new` to room `user_${userId}`
- `NotificationContext` maintains unread count across the app
- Dropdown in NavBar: type emoji, content snippet, mark-as-read, navigate to `link` field
- REST: `GET /notifications`, `PUT /notifications/:id/read`, `PUT /notifications/read-all`, `DELETE /notifications/:id`

---

## Known Issues Summary

| Issue | Location | Impact |
|-------|----------|--------|
| `/for-mentors` route missing | Waitlist + Home nav | 404 on click |
| `/search-alumni` route missing | Dashboard "Find Peers & Mentors" | 404 on click |
| `/alumni/:id` route missing | Dashboard "View Public Profile" | 404 on click |
| `FindGroup.js:152` compares `group.leader` (user ID) vs `currentUser.name` (display name) | Find Group page | Delete icon never renders for group leaders |
| No onboarding flow after registration | Post-registration | Empty lobby with no guidance |
| Email verification banner only on Dashboard | App-wide | Low discoverability |
| Wiki + Q&A content renders as plain text | `/wiki`, `/qa` | No Markdown formatting in articles or answers |
| No text search on Marketplace | `/marketplace` | Users can only filter by type |
| `VideoCall.js` page exists with no route | Codebase | Dead code |
| Quiz from standalone AI Chat missing `groupId` | `/ai-chat` quiz mode | 400 error on quiz submission |
