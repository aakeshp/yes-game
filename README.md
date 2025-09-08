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
- **Google OAuth authentication**: Secure admin login with environment isolation
- **Game management**: Create and manage multiple games with unique codes
- **Session control**: Create, edit, and control voting sessions
- **Live monitoring**: Real-time view of active sessions and participants
- **Game renaming**: Rename games (restricted once sessions go live)
- **Easy sharing**: Copy game codes directly for quick distribution
- **Export results**: Download session data and leaderboards

### 🌐 Technical Highlights
- **Real-time updates**: WebSocket integration for live session updates
- **Production-ready sessions**: PostgreSQL-backed session storage for scalability
- **Secure authentication**: Dual-environment Google OAuth with production isolation
- **Responsive design**: Works seamlessly on desktop and mobile
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

3. **Set up Google OAuth** (see detailed setup below)

4. **Set up environment variables**
   Create a `.env` file with:
   ```env
   DATABASE_URL=your_postgresql_connection_string
   
   # Development OAuth credentials
   GOOGLE_CLIENT_ID=your_dev_google_oauth_client_id
   GOOGLE_CLIENT_SECRET=your_dev_google_oauth_client_secret
   
   # Production OAuth credentials (for deployment)
   GOOGLE_CLIENT_ID_PROD=your_prod_google_oauth_client_id
   GOOGLE_CLIENT_SECRET_PROD=your_prod_google_oauth_client_secret
   PRODUCTION_DOMAIN=your-custom-domain.com
   
   # Common settings
   SESSION_SECRET=your_secure_session_secret
   ADMIN_EMAILS=admin1@example.com,admin2@example.com
   ```

5. **Set up the database**
   ```bash
   npm run db:push
   ```

6. **Start the development server**
   ```bash
   npm run dev
   ```

7. **Open your browser**
   Navigate to `http://localhost:5000`

## 🔐 Google OAuth Setup

This application uses **separate Google OAuth credentials** for development and production environments.

**Why Separate Apps?**
- 🔒 **Security isolation** between environments
- 🌐 **Different callback URLs** (dev vs production domains)  
- 🚀 **Prevents credential mix-ups** during deployment

**Setup Required:**
- Create OAuth app for development with callback: `https://your-dev-domain/auth/google/callback`
- Create separate OAuth app for production with callback: `https://your-prod-domain/auth/google/callback`
- Configure environment variables with respective Client IDs and Secrets

Refer to [Google Cloud Console](https://console.cloud.google.com/) to create OAuth applications.

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

## 🚀 Deployment Options

### General Deployment
This app can be deployed on any Node.js hosting platform:
- Set production environment variables (see environment setup above)
- Configure PostgreSQL database
- Set up custom domain with HTTPS
- Ensure WebSocket support for real-time features

### Replit Deployment (Recommended)
1. **Set up production Google OAuth app** (see OAuth Setup section above)

2. **Configure Replit Secrets** with production environment variables:
   ```
   GOOGLE_CLIENT_ID_PROD=your_prod_client_id
   GOOGLE_CLIENT_SECRET_PROD=your_prod_client_secret
   PRODUCTION_DOMAIN=your-custom-domain.com
   ADMIN_EMAILS=admin1@example.com,admin2@example.com
   SESSION_SECRET=your_secure_session_secret
   DATABASE_URL=(automatically provided by Replit)
   ```

3. **Deploy using Replit's deployment system**:
   - Click "Deploy" in your Replit workspace
   - Choose "Autoscale Deployment" for optimal performance
   - Your app will be live with automatic HTTPS and scaling

### Production Features
- ✅ **PostgreSQL session storage** scales automatically
- ✅ **Trust proxy configuration** for secure cookies behind Replit's infrastructure  
- ✅ **Environment-specific OAuth** prevents dev credentials in production
- ✅ **WebSocket support** for real-time features
- ✅ **Automatic TLS certificates** and domain management

### Custom Domain Setup
1. In Replit Deployments, configure your custom domain
2. Update `PRODUCTION_DOMAIN` secret to match your domain
3. Update your Google OAuth production app redirect URI
4. Deploy - your app will automatically handle the environment switch

---

Built with ❤️ for interactive learning and team engagement