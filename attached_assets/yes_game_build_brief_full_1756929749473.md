# Yes Game — Replit Build Brief

## 0) Summary
Multiplayer web app. **Admins** create **Games** that contain multiple **Sessions**. In each Session, players vote **Yes/No** on one question and guess the **total number of Yes votes**. After the timer, reveal results and award points. **Leaderboard** is at the Game level (cumulative across Sessions).

**Anti-cheat**: During a live Session, **no interim tallies** (for anyone, including Admins). Results are revealed only after close.

---

## 1) Tech Stack & Project Setup
- **Frontend**: React + Vite  
- **Backend**: Node.js + Express + Socket.IO  
- **DB**: SQLite (Prisma or better-sqlite3)  
- **Auth**  
  - Admin: cookie-based session  
  - Participant: `participantId` stored in localStorage (scoped to Game)  
- **Hosting**: Single Replit project (web server + websockets)

**Replit tasks**
- `npm create vite@latest yes-game -- --template react`
- `npm i express socket.io cors`
- `npm i prisma @prisma/client` (or `better-sqlite3`)
- `npm i cookie-session uuid zod concurrently`
- Add dev script: `"dev": "concurrently \"vite\" \"node server.js\""`, or proxy `/api` via Vite.

---

## 2) Domain Model (DB Schema)
**Game**
- `id (uuid)`, `name`, `code` (short join code)  
- `status`: `active | archived`  
- `createdAt`

**Session**
- `id`, `gameId`, `question (text)`, `timerSeconds (int)`  
- `status`: `draft | live | closed | canceled`  
- `startedAt`, `endsAt`, `endedAt`

**Participant**
- `id`, `gameId`, `displayName`, `ownerAdminUserId?` (nullable; admin who owns this participant profile if any)  
- `createdAt`

**Submission** (Vote + Guess, last write wins before lock)
- `id`, `sessionId`, `participantId`  
- `vote`: `YES | NO | NULL`  
- `guessYesCount (int|null)`  
- `submittedAt`

**AdminUser**
- `id`, `name`, `email?`, `createdAt`

**AuditLog** (optional but recommended)
- `id`, `who (adminUserId)`, `what`, `sessionId?`, `gameId?`, `at`

**Indexes**
- `Submission(sessionId, participantId)` unique  
- `Session(gameId)`, `Participant(gameId)`

---

## 3) Core Rules

### Scoring per Session
Let `A = actualYesCount` (**only submitted votes**; non-voters excluded). For each participant:
- If `guess == A` → **5 pts**
- If `abs(guess − A) == 1` → **3 pts**
- Else → **0 pts**
- If **no guess** → **0 pts**
- If **no vote** → excluded from totals and cannot earn points  
- **Multiple participants can score** (ties allowed)

### Leaderboard (per Game)
- Sum a participant’s points across **all closed Sessions** in the Game.

### Timing / Joining
- Admin sets `timerSeconds` (e.g., 30s).  
- **Join cutoff**: joining a live Session allowed **until 10s remain**.  
- Participants may **update** vote/guess until expiry; server locks on expiry.  
- **Restart**: allowed **only if no submissions exist**; otherwise *clone* a fresh Session.

### Anti-cheat
- During `live`, **no interim aggregates/tallies** are emitted or returned via APIs (even to Admins).  
- Only on `closed` do we compute and emit results.

---

## 4) Roles & Two-Tab Workflow (Admin-as-Participant)
- A human can act as **Admin** and as **Participant** in the same Game via a separate Participant profile.
- Keep **Admin** and **Player** UIs on separate routes:
  - Admin app: `/admin/*` (e.g., `/admin/games/:gameId`)
  - Player app: `/play/:gameCode`
- Typical flow:
  1. Admin creates and starts a Session in the **Admin tab**.
  2. Click **Play as Participant** → opens **Player tab** to `/play/:gameCode`.
  3. Admin plays normally in Player tab; Admin tab shows timer/status only (no tallies).
  4. After close, results appear and the Game leaderboard updates.

---

## 5) API (minimal)

### REST
- `POST /api/games` → `{ gameId, code }`
- `GET  /api/games/:gameId` → `{ id, name, code, status, leaderboard[] }`
- `POST /api/games/:gameId/sessions` → `{ sessionId }`
- `POST /api/sessions/:sessionId/start` → `{ startedAt, endsAt }`
- `POST /api/sessions/:sessionId/restart` → clone settings into a new draft session (**only if no submissions exist**)
- `GET  /api/sessions/:sessionId`
  - When `draft`: full config
  - When `live`: **minimal state** → `{ status, question, endsAt }` (no aggregates)
  - When `closed`: full results payload

### WebSockets (Socket.IO)
Namespace: `/session`, Room: `session:<sessionId>`
- `session:join` → `{ sessionId, participantId?, displayName }` → returns `{ status, question, endsAt, yourSubmission? }`
- `session:submit` → `{ vote?, guess? }` (either/both) → ack with `yourSubmission`
- `session:tick` → `{ now, endsAt }` (1s cadence)
- `session:results` (on close) →
```
{
  yesCount, noCount,
  rows: [ { name, vote, guess, points }, ... ],
  leaderboardDelta: [ { participantId, deltaPoints } ]
}
```

**Server must never emit counts during `live`.**

---

## 6) Results Computation (transactional pseudocode)
```js
// On timer expiry (server-side):
db.transaction(() => {
  // 1) Lock session
  update Session set status='closed', endedAt=now() where id=:sessionId;

  // 2) Fetch submissions that have a vote
  const subs = select * from Submission where sessionId=:sessionId;

  // 3) Compute A = number of YES votes among submitted votes
  const A = subs.filter(s => s.vote === 'YES').length;

  // 4) Score everyone
  const scored = subs.map(s => {
    const hasGuess = Number.isInteger(s.guessYesCount);
    if (!hasGuess) return { ...s, points: 0 };
    const err = Math.abs(s.guessYesCount - A);
    const points = err === 0 ? 5 : (err === 1 ? 3 : 0);
    return { ...s, points };
  });

  // 5) Persist points & update Game leaderboard totals
  // ... write points, then aggregate for leaderboard ...

  // 6) Emit final results
  emit('session:results', { yesCount: A, noCount: subs.filter(s => s.vote==='NO').length, rows: scored });
});
```

---

## 7) UI Contract (maps to wireframes)

### Admin Console
- Cards:
  - **Game Settings + Share Join Code/Link**
  - **Create Session** (Question, Timer)
  - **Start / Restart** (Restart hidden/disabled after first submission)
  - **Session List** (Draft / Live / Closed)
  - **Play as Participant** (+ “Switch Admin ↔ Player”)
- While `live`: show **Live-lock banner** and **disable controls**
- After `closed`: “Show Results” button

### Player — Live Session
- “You are playing as: <name>”
- Question, Big Timer, **Yes/No** buttons, Numeric Guess input
- **Submit/Update** button (enabled until expiry)
- Join cutoff enforced at **T ≤ 10s**

### Player — Results
- “Yes = N / No = M”
- Winner(s)/close guessers highlighted
- Table: Name | Vote | Guess | Points
- Link/panel to **Leaderboard** (Game totals)

### Game Lobby (Player)
- Enter/display name, join Game by code, list of Sessions (Upcoming / Live / Closed)

---

## 8) Edge Cases & Resilience
- **Admin disconnects**: Session continues (server authoritative)
- **Participant reloads**: On re-join, server returns current state + last submission
- **Clock drift**: Clients render from server `endsAt`; server rejects late writes
- **Double-submissions**: Last write before lock wins
- **No participants**: Close cleanly; zero tallies
- **Privacy**: Votes are public **after** close; nothing revealed during live

---

## 9) Acceptance Criteria (checklist)
- Create Game; share join link/code
- Create Session; Start → Live → auto Close at timer
- Join cutoff at **T ≤ 10s**
- Players can **update** vote/guess until expiry
- **No interim tallies** during live (Admin or Player)
- On close: totals + per-participant votes/guesses/points; multiple scorers allowed
- Leaderboard updates after each closed Session (cumulative)
- Admin can **Play as Participant** in a separate tab; both tabs work concurrently
- **Restart** allowed only if **no submissions** exist; otherwise clone a new Session
- Refresh/disconnect behavior restores correct state

---

## 10) Nice-to-Have (post‑v1)
- Anonymous mode (`revealVotes=false`)
- Multi-Session scheduler
- CSV export of results
- Basic a11y pass (focus states, ARIA, contrast)

---

## 11) Replit Notes
- Ensure websockets are enabled on the repl
- Expose a single port; Vite dev server proxies `/api` and `/socket.io/*` to Node
- `.replit` example:
```
run = ["sh", "-c", "npm run dev"]
```
