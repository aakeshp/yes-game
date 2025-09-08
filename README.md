# Yes Game 🎯

A real-time multiplayer voting and guessing game platform where participants vote Yes/No on questions and try to guess how many people voted "Yes". Perfect for team building, education, and interactive presentations.

## ✨ Features

### 🎮 Game Mechanics
- **Real-time voting**: Participants vote Yes/No on session questions
- **Guessing challenge**: Players guess the total number of Yes votes
- **Anti-cheat measures**: No interim results shown during live sessions
- **Point scoring**: Earn points for correct guesses and participation
- **Cumulative leaderboards**: Track performance across multiple sessions

### 👨‍💼 Admin Features  
- **Google OAuth authentication**: Secure admin login
- **Game management**: Create and manage multiple games
- **Session control**: Create, edit, and control voting sessions
- **Live monitoring**: Real-time view of active sessions and participants
- **Game renaming**: Rename games (restricted once sessions go live)
- **Export results**: Download session data and leaderboards

### 🌐 Technical Highlights
- **Real-time updates**: WebSocket integration for live session updates
- **Responsive design**: Works seamlessly on desktop and mobile
- **Database persistence**: PostgreSQL with proper data relationships
- **Type safety**: Full TypeScript implementation across frontend and backend

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- PostgreSQL database (or use Replit's built-in database)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd yes-game
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file with:
   ```env
   DATABASE_URL=your_postgresql_connection_string
   GOOGLE_CLIENT_ID=your_google_oauth_client_id
   GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
   SESSION_SECRET=your_session_secret
   ADMIN_EMAILS=admin1@example.com,admin2@example.com
   ```

4. **Set up the database**
   ```bash
   npm run db:push
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to `http://localhost:5000`

## 🎯 How to Play

### For Participants
1. **Join a game**: Enter the game code provided by the admin
2. **Enter your name**: Choose a display name for the leaderboard
3. **Vote and guess**: When sessions start, vote Yes/No and guess the total Yes votes
4. **Earn points**: Get points for correct guesses (exact match = 5 points, close = 3 points)
5. **Track progress**: View your ranking on the cumulative leaderboard

### For Admins
1. **Sign in**: Use Google OAuth to access the admin console
2. **Create games**: Set up new games with unique join codes
3. **Manage sessions**: Create questions with custom timers
4. **Monitor live**: Watch real-time participant activity during sessions
5. **Review results**: Export data and view detailed leaderboards

## 🛠️ Technology Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development builds
- **Tailwind CSS** for styling
- **ShadCN UI** components with Radix UI primitives
- **TanStack Query** for server state management
- **Wouter** for client-side routing

### Backend
- **Express.js** server with TypeScript
- **WebSocket** for real-time communication
- **Drizzle ORM** with PostgreSQL
- **Google OAuth 2.0** for authentication
- **Zod** for runtime validation

### Database Schema
- **admin_users**: Google OAuth admin accounts
- **games**: Game instances with join codes
- **sessions**: Individual voting rounds within games
- **participants**: Player profiles and display names
- **submissions**: Vote and guess submissions
- **session_points**: Scoring and leaderboard data

## 🏗️ Development

### Available Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run db:push` - Push database schema changes
- `npm run db:studio` - Open Drizzle Studio for database management

### Project Structure
```
├── client/               # React frontend
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Route-based page components
│   │   ├── lib/         # Utilities and configurations
│   │   └── hooks/       # Custom React hooks
├── server/              # Express.js backend
│   ├── routes.ts        # API endpoints
│   ├── storage.ts       # Database operations
│   └── index.ts         # Server entry point
├── shared/              # Shared types and schemas
│   └── schema.ts        # Database schema definitions
└── components.json      # ShadCN UI configuration
```

## 🎨 Design Principles

- **Anti-cheat first**: No interim results to maintain fairness
- **Real-time experience**: Immediate updates via WebSocket connections
- **Mobile-friendly**: Responsive design for all devices  
- **Type-safe**: End-to-end TypeScript for reliability
- **Accessible**: Following WCAG guidelines with semantic HTML

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## 🔧 Deployment

This application is designed to work seamlessly with Replit Deployments:
1. Configure your environment variables in Replit Secrets
2. Use the Deploy button in your Replit workspace
3. Choose "Autoscale Deployment" for optimal performance
4. Your app will be live with automatic scaling and TLS certificates

---

Built with ❤️ for interactive learning and team engagement