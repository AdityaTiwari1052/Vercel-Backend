import express from "express";
import { 
  signup, 
  login, 
  getMe, 
  updateMe, 
  updateApplicationStatus,
  getRecruiterApplications
} from "../controllers/recruiter.controller.js";
import { companyLogoUpload } from "../middlewares/multer.js";
import jwtAuth from '../middlewares/jwtAuth.js';

const router = express.Router();

// CORS is handled by the main application middleware

// Public routes
router.post("/signup", companyLogoUpload, signup);
router.post("/login", login);

// Protected routes (require JWT authentication)
router.use(jwtAuth);

// Recruiter profile routes
router.get("/me", getMe);
router.patch("/update-me", updateMe);

// Application management routes
router.get(
  '/applications',
  getRecruiterApplications
);

router.patch(
  '/applications/status',
  updateApplicationStatus
);

export default router;
