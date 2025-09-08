import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.set('trust proxy', 1); // Trust first proxy for secure cookies behind Replit proxy
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session configuration - isolated from Replit platform
// Use same production detection as OAuth config
const isProduction = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1';

// PostgreSQL session store for production reliability
const PgSession = connectPgSimple(session);

app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'user_sessions',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'fallback-dev-secret',
  name: 'oak-voting-game-session', // Unique session name to avoid conflicts
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    // NO domain setting - defaults to exact hostname only
    // This prevents interference with Replit platform cookies
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

// Google OAuth Strategy with environment-specific configuration
const getOAuthConfig = () => {
  if (process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1') {
    // Production: Use configurable domain and production-specific credentials
    const productionDomain = process.env.PRODUCTION_DOMAIN;
    const clientID = process.env.GOOGLE_CLIENT_ID_PROD;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET_PROD;
    
    if (!productionDomain) {
      console.error('❌ OAuth Setup - PRODUCTION_DOMAIN environment variable required for production');
      throw new Error('PRODUCTION_DOMAIN environment variable required for production');
    }
    if (!clientID || !clientSecret) {
      console.error('❌ OAuth Setup - GOOGLE_CLIENT_ID_PROD and GOOGLE_CLIENT_SECRET_PROD required for production');
      throw new Error('GOOGLE_CLIENT_ID_PROD and GOOGLE_CLIENT_SECRET_PROD required for production');
    }
    
    return {
      clientID: clientID,
      clientSecret: clientSecret,
      callbackURL: `https://${productionDomain}/auth/google/callback`
    };
  } else {
    // Development: Use Replit's dev domain and main credentials (GOOGLE_CLIENT_ID/SECRET are for dev)
    const devDomain = process.env.REPLIT_DEV_DOMAIN;
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    if (!devDomain) {
      console.error('❌ OAuth Setup - REPLIT_DEV_DOMAIN not available in development');
      throw new Error('REPLIT_DEV_DOMAIN not available in development');
    }
    if (!clientID || !clientSecret) {
      console.error('❌ OAuth Setup - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required for development');
      throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required for development');
    }
    
    return {
      clientID: clientID,
      clientSecret: clientSecret,
      callbackURL: `https://${devDomain}/auth/google/callback`
    };
  }
};

try {
  const oauthConfig = getOAuthConfig();
  
  // Basic OAuth setup confirmation (production safe)
  console.log('OAuth setup complete');

  passport.use(new GoogleStrategy({
    clientID: oauthConfig.clientID,
    clientSecret: oauthConfig.clientSecret,
    callbackURL: oauthConfig.callbackURL
  },
  async (accessToken: any, refreshToken: any, profile: any, done: any) => {
    // Check if user email is in admin allowlist
    const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(email => email.trim()) || [];
    const userEmail = profile.emails?.[0]?.value;
    
    if (userEmail && adminEmails.includes(userEmail)) {
      return done(null, {
        id: profile.id,
        email: userEmail,
        name: profile.displayName,
        isAdmin: true
      });
    } else {
      return done(null, false);
    }
  }));
  
} catch (error) {
  console.error('❌ OAuth Setup Failed:', error instanceof Error ? error.message : error);
  console.error('💡 Check your environment variables and ensure proper OAuth configuration');
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
      
      // Only log response body in development, and sanitize sensitive endpoints
      if (process.env.NODE_ENV === 'development' && capturedJsonResponse) {
        // Don't log response bodies for auth endpoints or user data
        if (!path.includes('/auth') && !path.includes('/admin/me')) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }
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
