import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from 'url';
import { clerkMiddleware } from '@clerk/express';
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

import userRouter from "./routes/user.route.js";
import connectDB from "./utils/db.js";
import jobRoute from "./routes/job.route.js";
import recruiterAuthRoute from "./routes/recruiterAuth.route.js";
import recruiterRoute from "./routes/recruiter.route.js";
import webhookRoutes from './routes/webhook.route.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();

// ================= WEBHOOK =================
app.use('/api/webhook', webhookRoutes);

// ================= BODY PARSER =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ================= CORS =================
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://vercel-frontend-pi-steel.vercel.app'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS not allowed"));
    }
  },
  credentials: true
}));

// ================= CLERK =================
app.use(clerkMiddleware());

// ================= REQUEST LOGGER (FIXED) =================
app.use((req, res, next) => {

  if (req.originalUrl.startsWith('/api/')) {
    console.log(`🔍 ${req.method} ${req.originalUrl}`);
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// ================= ROUTES =================
app.get("/", (req, res) => {
  res.json({ message: "Backend API running 🚀" });
});

app.use('/api/v1/user', userRouter);
app.use("/api/v1/jobs", jobRoute);
app.use("/api/v1/recruiter/auth", recruiterAuthRoute);
app.use("/api/v1/recruiter", recruiterRoute);

// ================= ERROR HANDLER =================
app.use((err, req, res, next) => {
  console.error(err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Server Error"
  });
});

// ================= SERVER =================
const PORT = process.env.PORT || 8000;

const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`✅ Server running at port ${PORT}`);
  });
};

startServer();