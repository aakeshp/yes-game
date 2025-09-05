import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  console.log('🔧 OAuth Setup - Client ID exists:', !!process.env.GOOGLE_CLIENT_ID);
  console.log('🔧 OAuth Setup - Client Secret exists:', !!process.env.GOOGLE_CLIENT_SECRET);
  console.log('🔧 OAuth Setup - Admin Emails configured:', process.env.ADMIN_EMAILS || 'NOT SET');
  
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback" // Use relative URL since we have multiple domains configured in Google Console
  },
  async (accessToken, refreshToken, profile, done) => {
    console.log('🔍 OAuth Callback - Profile received:', {
      id: profile.id,
      displayName: profile.displayName,
      emails: profile.emails
    });
    
    // Check if user email is in admin allowlist
    const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(email => email.trim()) || [];
    const userEmail = profile.emails?.[0]?.value;
    
    console.log('🔍 OAuth Callback - User email:', userEmail);
    console.log('🔍 OAuth Callback - Admin emails list:', adminEmails);
    console.log('🔍 OAuth Callback - Email match found:', adminEmails.includes(userEmail || ''));
    
    if (userEmail && adminEmails.includes(userEmail)) {
      console.log('✅ OAuth Success - User authorized');
      return done(null, {
        id: profile.id,
        email: userEmail,
        name: profile.displayName,
        isAdmin: true
      });
    } else {
      console.log('❌ OAuth Denied - User not in admin list');
      return done(null, false);
    }
  }));
} else {
  console.error('❌ OAuth Setup Failed - Missing credentials');
}

passport.serializeUser((user: any, done) => {
  done(null, user);
});

passport.deserializeUser((user: any, done) => {
  done(null, user);
});

// Admin authentication middleware
function requireAdmin(req: any, res: Response, next: NextFunction) {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    res.status(401).json({ error: 'Admin access required' });
  }
}

// Make middleware available to routes
app.locals.requireAdmin = requireAdmin;

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
