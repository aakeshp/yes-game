# Overview

This is a multiplayer voting web application built as a real-time game platform. The system allows admins to create games containing multiple sessions, where participants vote Yes/No on questions and guess the total number of Yes votes. The application emphasizes anti-cheat measures by preventing interim tallies during live sessions and only revealing results after the timer expires.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Full-Stack Architecture
The application follows a monorepo structure with separate client and server directories, built on a Node.js/Express backend with React frontend. The architecture supports real-time communication through WebSockets and uses PostgreSQL with Drizzle ORM for data persistence.

**Frontend Architecture:**
- React 18 with TypeScript using Vite as the build tool
- ShadCN UI component library with Radix UI primitives for consistent design
- Wouter for client-side routing instead of React Router
- TanStack Query for server state management and caching
- Tailwind CSS for styling with custom design tokens

**Backend Architecture:**
- Express.js server with TypeScript
- WebSocket integration using native WebSocket API for real-time features
- RESTful API for standard CRUD operations
- Shared schema definitions between client and server for type safety

**Database Design:**
- PostgreSQL database with Drizzle ORM for type-safe database operations
- Schema includes: admin_users, games, sessions, participants, submissions, and session_points tables
- Support for game codes, session management, vote tracking, and leaderboard calculations

**Real-time Communication:**
- WebSocket connections for live session updates
- Session room management for grouping participants
- Real-time vote submission and timer synchronization
- Admin live view capabilities for monitoring active sessions

**Authentication & Authorization:**
- Simple session-based authentication for admin users
- Participant identification using localStorage-stored participant IDs
- Game-scoped participant management

## Key Design Patterns

**Component Architecture:**
- Shared UI components in `/components/ui` following the ShadCN pattern
- Page components in `/pages` for route-based organization
- Custom hooks for WebSocket management and mobile detection

**State Management:**
- Server state managed through TanStack Query with automatic caching
- WebSocket state handled through custom hooks
- Local storage for participant persistence across sessions

**Type Safety:**
- Shared TypeScript interfaces between client and server
- Zod schemas for runtime validation
- Drizzle schema integration with TypeScript types

**Development Workflow:**
- Vite for fast development builds and HMR
- Separate build processes for client and server
- Development mode with integrated error handling

# External Dependencies

## Core Framework Dependencies
- **React & Vite**: Frontend framework and build tool for modern development experience
- **Express.js**: Backend web framework for API and WebSocket server
- **TypeScript**: Type safety across the entire application stack

## Database & ORM
- **PostgreSQL**: Primary database using Neon serverless PostgreSQL
- **Drizzle ORM**: Type-safe database operations with schema management
- **Drizzle Kit**: Database migration and schema management tools

## UI & Styling
- **Tailwind CSS**: Utility-first CSS framework for styling
- **Radix UI**: Headless UI primitives for accessible components
- **ShadCN UI**: Pre-built component system based on Radix UI
- **Lucide React**: Icon library for consistent iconography

## State Management & Data Fetching
- **TanStack Query**: Server state management with caching and synchronization
- **Wouter**: Lightweight client-side routing library

## Validation & Utilities
- **Zod**: Runtime type validation for API inputs and schema validation
- **Class Variance Authority**: Utility for building variant-based component APIs
- **Date-fns**: Date manipulation and formatting utilities

## Development Tools
- **ESBuild**: Fast bundling for production server builds
- **TSX**: TypeScript execution for development server
- **Replit Integration**: Development environment integration and error handling

## Real-time Communication
- **Native WebSocket API**: Real-time bidirectional communication for live sessions
- **Custom WebSocket wrapper**: Abstraction layer for connection management and reconnection logic