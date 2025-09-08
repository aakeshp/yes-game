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
  
  // Only log OAuth setup in development
  if (process.env.NODE_ENV === 'development') {
    console.log('🔧 OAuth Setup - Environment:', process.env.NODE_ENV);
    console.log('🔧 OAuth Setup - Using main credentials for dev:', !!process.env.GOOGLE_CLIENT_ID);
    console.log('🔧 OAuth Setup - Callback URL:', oauthConfig.callbackURL);
    console.log('🔧 OAuth Setup - Admin Emails configured:', process.env.ADMIN_EMAILS ? 'SET' : 'NOT SET');
  }

  passport.use(new GoogleStrategy({
    clientID: oauthConfig.clientID,
    clientSecret: oauthConfig.clientSecret,
    callbackURL: oauthConfig.callbackURL
  },
  async (accessToken: any, refreshToken: any, profile: any, done: any) => {
    // Check if user email is in admin allowlist
    const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(email => email.trim()) || [];
    const userEmail = profile.emails?.[0]?.value;
    
    // Safe production debugging (no sensitive data logged)
    const isProduction = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1';
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (isDevelopment) {
      console.log('🔍 OAuth Callback - Processing user authentication');
      console.log('🔍 OAuth Callback - Email match found:', adminEmails.includes(userEmail || ''));
    }
    
    // Production debugging (safe, no sensitive info)
    if (isProduction) {
      console.log('🔍 Production OAuth Debug - Callback received');
      console.log('🔍 Production OAuth Debug - Admin emails configured:', adminEmails.length > 0);
      console.log('🔍 Production OAuth Debug - User email provided:', !!userEmail);
      console.log('🔍 Production OAuth Debug - Email validation result:', adminEmails.includes(userEmail || ''));
    }
    
    if (userEmail && adminEmails.includes(userEmail)) {
      if (isDevelopment) {
        console.log('✅ OAuth Success - User authorized');
      }
      if (isProduction) {
        console.log('✅ Production OAuth Debug - User authorization successful');
      }
      return done(null, {
        id: profile.id,
        email: userEmail,
        name: profile.displayName,
        isAdmin: true
      });
    } else {
      if (isDevelopment) {
        console.log('❌ OAuth Denied - User not in admin list');
      }
      if (isProduction) {
        console.log('❌ Production OAuth Debug - User authorization failed');
        console.log('❌ Production OAuth Debug - Check admin email configuration');
      }
      return done(null, false);
    }
  }));
  
  if (process.env.NODE_ENV === 'development') {
    console.log('✅ OAuth Setup Complete');
  }
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
