# API Endpoints

**Users:** `GET /users/`, `GET /users/public`, `GET /users/:id`, `POST /users/register`, `POST /users/login`, `POST /users/google-login`, `POST /users/refresh`, `PUT /users/:id`, `PUT /users/updateXP/:id`, `POST /users/forgot-password`, `POST /users/reset-password`, `POST /users/send-verification`, `GET /users/verify-email`

**Groups:** `GET /groups/`, `GET /groups/byID/:id`, `POST /groups/`, `POST /groups/:id/verify-password`, `DELETE /groups/:id`

**Group Membership:** `POST/DELETE /groupsUsers/user/:userId/group/:groupId`, `GET /groupsUsers/byUser/:userId`, `GET /groupsUsers/byGroup/:groupId`

**Chats:** `GET /chats/:groupId`, `POST /chats/`, `PUT /chats/pin/:id`, `DELETE /chats/:id`

**AI:** `POST /ai/chat`, `POST /ai/ask`, `POST /ai/quiz`, `POST /ai/suggest`, `GET /ai/sources`, `GET /ai/history/:groupId`, `DELETE /ai/history/:groupId`, `GET /ai/credits`, `POST /ai/reindex`, `POST /ai/upload-document`, `GET /ai/documents`, `DELETE /ai/documents/:id`

**AI Feedback:** `POST /ai/feedback` (body: `{queryText, rating, messageId?, clickedSources?, comment?}`), `GET /ai/feedback/my`, `GET /ai/feedback/stats/mine`

**Recaps:** `POST /recaps/generate`, `GET /recaps/byUser/:userId`, `GET /recaps/:id`

**Streaks:** `GET /streaks/me`, `GET /streaks/leaderboard`, `GET /streaks/:userId`, `GET /streaks/history/:userId`, `PUT /streaks/goal`

**Content:** Standard CRUD at `/posts`, `/wiki`, `/qa`, `/resources`, `/endorsements`, `/reports`. Writes require auth.

**Admin** (requires `isAdmin`): `GET /admin/dashboard`, `GET /admin/reports`, `PUT /admin/reports/:id`, `GET /admin/users`, `PUT /admin/users/:id/ban|unban|make-admin`

**Notifications:** `GET /notifications`, `GET /notifications/unread-count`, `PUT /notifications/:id/read`, `PUT /notifications/read-all`, `DELETE /notifications/:id`. Real-time via Socket.io `notification:new` to `user_${userId}`.

**Public (no auth, rate-limited):** `GET /public/stats`, `GET /public/open-questions?limit=N`, `POST /public/ai-try` (3/day/IP), `GET /public/waitlist/count`, `POST /public/waitlist`

**Socket.io:** `join_room` → `room_state`; `send_message` → `receive_message`; `whiteboard_draw/clear` → broadcast; WebRTC offer/answer point-to-point routing.
