import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from 'url';
import { clerkMiddleware } from '@clerk/express';
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import userRouter from "./routes/user.route.js"
import connectDB from "./utils/db.js";
import jobRoute from "./routes/job.route.js";
import recruiterAuthRoute from "./routes/recruiterAuth.route.js";
import recruiterRoute from "./routes/recruiter.route.js";
import webhookRoutes from './routes/webhook.route.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Debug: Check if .env file is loaded
console.log('🔧 Environment Variables Check:');
console.log('SMTP_USER loaded:', process.env.SMTP_USER ? '✅ Yes' : '❌ No');
console.log('SMTP_PASS loaded:', process.env.SMTP_PASS ? '✅ Yes (length: ' + process.env.SMTP_PASS.length + ')' : '❌ No');
console.log('JWT_SECRET loaded:', process.env.JWT_SECRET ? '✅ Yes' : '❌ No');
console.log('MONGO_URI loaded:', process.env.MONGO_URI ? '✅ Yes' : '❌ No');
console.log('CLERK_PUBLISHABLE_KEY loaded:', process.env.CLERK_PUBLISHABLE_KEY ? '✅ Yes' : '❌ No');
console.log('CLERK_SECRET_KEY loaded:', process.env.CLERK_SECRET_KEY ? '✅ Yes' : '❌ No');
console.log('Environment file path:', path.resolve(__dirname, '../.env'));

const app = express();

// Webhook endpoint (must be before body parser and other middleware)
console.log('Registering webhook endpoint at /api/webhook');
app.use('/api/webhook', (req, res, next) => {
    console.log('Webhook request received at:', req.originalUrl);
    next();
}, webhookRoutes);

// Body parsers
app.use(express.json({ 
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    } 
}));

app.use(express.urlencoded({ 
    extended: true, 
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));

app.use(cookieParser());

// Request logging middleware
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5000',
  'http://localhost:8000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://job-portal-v3b1.onrender.com',
  'http://job-portal-v3b1.onrender.com'
];

// Configure CORS with enhanced security headers
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      return callback(null, true);
    }
    
    console.log('CORS blocked for origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true, // Important for cookies/session
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'Accept',
    'Origin',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Credentials',
    'Access-Control-Allow-Headers',
    'Access-Control-Allow-Methods'
  ],
  exposedHeaders: [
    'Content-Length',
    'Content-Type',
    'Authorization',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Credentials'
  ],
  maxAge: 600, // 10 minutes
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS with options as one of the first middleware
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Add headers before the routes are defined
app.use(function (req, res, next) {
  // Allow from any origin
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

  // Request headers you wish to allow
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,authorization');


  res.setHeader('Access-Control-Allow-Credentials', true);

  // Pass to next layer of middleware
  next();
});

// Clerk middleware
app.use(clerkMiddleware());

// Public routes (no authentication required)
app.get('/api/public', (req, res) => {
  res.json({ message: 'This is a public endpoint' });
});

// Protected routes (authentication required)
app.get('/api/protected', (req, res) => {
  // req.auth contains the authenticated user's information
  res.json({ 
    message: 'This is a protected endpoint',
    user: req.auth 
  });
});

// Error handling middleware for unauthorized access
app.use((err, req, res, next) => {
  if (err.status === 401) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      error: 'Unauthorized'
    });
  }
  next(err);
});

// Request logging middleware
app.use((req, res, next) => {
  // Skip logging for health checks
  if (req.originalUrl === '/health') {
    return next();
  }

  // Log API requests for debugging
  if (req.originalUrl.startsWith('/api/')) {
    console.log(`🔍 API Request: ${req.method} ${req.originalUrl}`);
    console.log(`🔍 Headers:`, {
      authorization: req.headers.authorization ? 'Present' : 'Missing',
      origin: req.headers.origin,
      'content-type': req.headers['content-type']
    });
  }
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    return res.status(200).end();
  }
  
  // Make a copy of the body for logging
  const bodyCopy = { ...req.body };
  if (bodyCopy.password) {
    bodyCopy.password = '***REDACTED***';
  }
  
  console.log('Parsed body:', JSON.stringify(bodyCopy, null, 2));
  console.log('Content-Type:', req.get('Content-Type'));
  
  // Log the raw body for debugging
  const originalEnd = res.end;
  const chunks = [];
  
  // Intercept the response to log it
  res.end = function(chunk, ...args) {
    if (chunk) {
      // Handle both Buffer and string chunks
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk, 'utf8'));
      }
    }
    
    let body = '';
    if (chunks.length > 0) {
      body = Buffer.concat(chunks).toString('utf8');
    }
    
    console.log('\n=== RESPONSE ===');
    console.log(`Status: ${res.statusCode}`);
    try {
      if (body) {
        const jsonResponse = JSON.parse(body);
        console.log('Response body:', JSON.stringify(jsonResponse, null, 2));
      } else {
        console.log('Response body: (empty)');
      }
    } catch (e) {
      console.log('Response body (non-JSON):', body || '(empty)');
    }
    
    // Call the original end function
    return originalEnd.call(res, chunk, ...args);
  };
  
  next();
});

// Add security headers middleware
app.use((req, res, next) => {
  // Set security headers
  // Relaxed security headers - removed COEP/CORP to allow external resource loading
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  
  // For Cloudinary, Clerk, and other external resources
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "img-src 'self' data: https: http: blob:; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://*.clerk.accounts.dev https://*.clerk.accounts.workers.dev https://*.clerk.dev https://*.clerk.vercel.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "connect-src https://job-portal-v3b1.onrender.com http://localhost:8000 http://localhost:5173 https://api.cloudinary.com https://*.clerk.accounts.dev https://*.clerk.accounts.workers.dev https://*.clerk.dev https://*.clerk.vercel.com https://clerk-telemetry.com; " +
    "frame-src 'self' https://accounts.google.com https://*.clerk.accounts.dev https://*.clerk.dev; " +
    "font-src 'self' data:; " +
    "media-src 'self' data: https: http:; " +
    "worker-src 'self' blob: https://*.clerk.accounts.workers.dev https://*.clerk.dev; " +
    "child-src 'self' blob: https://*.clerk.accounts.workers.dev https://*.clerk.dev;"
  );
  
  next();
});

// API Routes
app.use('/api/v1/user', userRouter);
app.use("/api/v1/jobs", jobRoute);
app.use("/api/v1/recruiter/auth", recruiterAuthRoute);
app.use("/api/v1/recruiter", recruiterRoute);

// Global error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    
    // Handle JWT errors
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Authentication failed. Please log in again.'
        });
    }

    // Handle validation errors
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(val => val.message);
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: messages
        });
    }

    // Handle custom AppError
    if (err.isOperational) {
        return res.status(err.statusCode || 500).json({
            success: false,
            message: err.message
        });
    }

    // Handle other errors
    res.status(500).json({
        success: false,
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
});


// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});


// Static files and SPA fallback (MUST BE LAST)
app.use(express.static(path.join(__dirname, "..", "frontend", "dist")));
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "..", "frontend", "dist", "index.html"));
});

const PORT = process.env.PORT || 8000;

// Start Server
const startServer = async () => {
  await connectDB(); // Ensure database is connected first
  app.listen(PORT, () => {
      console.log(`✅ Server running at port ${PORT}`);
  });
};

startServer();