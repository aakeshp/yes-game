# Design Guidelines: Real-Time Multiplayer Voting Game

## Design Approach

**Selected Approach:** Reference-Based (Gaming/Interactive Experiences)

**Primary Inspiration:** Kahoot's engaging game sessions, Among Us's voting clarity, Jackbox Games' party atmosphere, Duolingo's competitive leaderboards

**Core Principles:**
- Instant readability for fast-paced gameplay
- Celebratory moments for correct guesses
- Clear differentiation between game states (waiting, voting, results)
- Competitive energy through leaderboards and live updates

---

## Typography System

**Font Stack:**
- Primary: 'Inter' (Google Fonts) - body text, UI elements, vote counts
- Display: 'Space Grotesk' (Google Fonts) - headings, game titles, dramatic moments

**Hierarchy:**
- Game Titles/Hero: text-6xl md:text-7xl font-bold (Space Grotesk)
- Section Headers: text-4xl md:text-5xl font-bold (Space Grotesk)
- Question Text: text-2xl md:text-3xl font-semibold (Inter)
- Vote Counts/Stats: text-5xl md:text-6xl font-bold tabular-nums (Inter)
- Leaderboard Names: text-lg md:text-xl font-medium (Inter)
- Body/Instructions: text-base md:text-lg (Inter)
- Button Labels: text-lg font-semibold uppercase tracking-wide (Inter)

---

## Layout System

**Spacing Primitives:** Tailwind units 4, 6, 8, 12, 16
- Component padding: p-6 md:p-8
- Section spacing: py-12 md:py-16
- Card gaps: gap-4 md:gap-6
- Button padding: px-8 py-4

**Container Strategy:**
- Full-width game sessions: max-w-7xl mx-auto
- Voting cards: max-w-2xl mx-auto
- Leaderboard panels: max-w-4xl mx-auto
- Mobile-first: All layouts stack to single column on mobile

---

## Component Library

### Hero Section
- Full-viewport dramatic entry (min-h-screen with large hero image)
- Centered content with large game title
- Prominent "Create Game" and "Join Game" CTAs (large buttons with backdrop-blur-md bg-white/20 treatment)
- Live game counter badge (e.g., "2,847 games playing now")
- Quick stats row below hero: Total Players, Games Played, Questions Answered

### Navigation
- Fixed top bar with logo left, game code/session info center, profile/menu right
- Game code display: Large monospace font in pill-shaped badge
- Mobile: Hamburger menu with slide-out drawer

### Game Session Screen
**Layout:** Three-panel responsive design
- Left: Current question card (max-w-2xl)
- Center: Large voting interface
- Right: Live leaderboard sidebar (sticky position, hidden on mobile until toggled)

### Voting Interface
**Yes/No Buttons:**
- Massive touch targets: min-h-32 on mobile, min-h-40 on desktop
- Full-width on mobile, side-by-side on desktop (grid grid-cols-2 gap-6)
- Icon + label combination (Heroicons: check-circle for Yes, x-circle for No)
- Selected state: ring-4 ring-offset-4 transform scale-105
- Disabled state during countdown

**Guess Input:**
- Below voting buttons
- Number input with -/+ stepper buttons flanking center
- Large display of current guess (text-4xl)
- Range hint text (e.g., "Guess between 0-100")

### Real-Time Updates Panel
- Toast-style notifications slide from top-right
- Live vote count ticker (animated counting up)
- Participant join/leave indicators (subtle, non-intrusive)
- Countdown timer: Circular progress ring with seconds remaining

### Leaderboard Component
**Structure:**
- Podium-style top 3 with medal icons (gold/silver/bronze)
- Ranked list below with rank badges
- Three-column grid: Rank | Player Name | Points
- Current user row highlighted with subtle pulse animation
- Score changes: +/- indicators with slide-in animation

**Leaderboard Card:**
- Rounded corners (rounded-2xl)
- Padding: p-6
- Each row: py-4 border-b transition-colors hover state
- Avatar placeholder circles for future enhancement

### Question Card
- Large rounded container (rounded-3xl)
- Question text: Prominent, centered
- Category badge: Top-right corner chip
- Question number: Small counter (e.g., "Question 3 of 10")
- Timer bar: Linear progress beneath question

### Results View
**Layout:**
- Reveal animation from voting view
- Correct answer banner (large checkmark or X icon)
- Actual vote breakdown: Horizontal bar chart showing Yes/No distribution
- Your guess vs. actual: Side-by-side comparison cards
- Points earned: Large celebratory number with confetti trigger (CSS animation)
- Next question button: Prominent, centered

### Game Creation/Join Flow
**Create Game:**
- Modal overlay (backdrop-blur-xl)
- Form centered: max-w-md
- Fields: Game name, question set selection, time limits
- Live preview of game code generation

**Join Game:**
- Centered card on blank canvas
- Large input for game code (text-3xl, letter-spacing-widest)
- Auto-uppercase, hyphen-separated format (e.g., ABCD-1234)
- Username input below
- Submit button transforms into loading state

### Session Management Dashboard
**Grid Layout:** (for hosts)
- Active games: Cards in masonry grid (grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
- Each card: Game name, participant count, current question, quick actions
- Color-coded status indicators (pulse animation for live)

---

## Icons

**Library:** Heroicons (CDN)

**Key Icons:**
- trophy: Leaderboard, winners
- check-circle / x-circle: Vote buttons, results
- user-group: Participant count
- clock: Timers
- chart-bar: Statistics
- play-circle: Start game
- arrow-right: Next question
- bolt: Live indicator
- star: Points/achievements

---

## Images

### Hero Section Image
**Placement:** Full-width background image behind hero content
**Description:** Energetic group of diverse friends gathered around phones/tablets, laughing and engaged in mobile gameplay. Vibrant, warm atmosphere with natural lighting. Shot from slightly above to show device screens. Modern, casual setting (living room or cafe). Image should convey excitement, competition, and social connection.
**Treatment:** Subtle overlay gradient (top-to-bottom) for text legibility

### Secondary Images
**Game Session Illustrations:**
- Isometric 3D illustrations of voting mechanisms (placeholder divs for future addition)
- Icon-style graphics for empty states ("No active games", "Waiting for players")

---

## Animations (Minimal, High-Impact)

- Vote submission: Scale + fade (200ms)
- Leaderboard position changes: Smooth reordering transition (300ms)
- Real-time vote count: Number counting animation
- Results reveal: Staggered fade-in of elements (100ms delays)
- Confetti on correct guess: Brief CSS particle animation (800ms)

---

## Accessibility

- All interactive elements: min-h-11 for touch targets
- Form inputs: Clear labels, error states with descriptive text
- Real-time updates: Announce to screen readers via aria-live regions
- Keyboard navigation: Logical tab order, focus indicators (ring-2)
- High contrast maintained throughout (tested later with color)