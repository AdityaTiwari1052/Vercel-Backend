import express from 'express';
import {
  getUserData,
  getAppliedJobs,
  applyForJob,
  uploadResume,
  deleteResume
} from '../controllers/user.controller.js';
import isAuthenticated from '../middlewares/isAuthenticated.js';
import { resumeUpload } from '../middlewares/multer.js';

const router = express.Router();

// Public routes - none currently

// Apply authentication middleware to all following routes
router.use(isAuthenticated());


router.get('/me/applications', getAppliedJobs);
router.post('/apply/:jobId', applyForJob);
router.put('/resume', resumeUpload, uploadResume);
router.delete('/resume', deleteResume);

// General user routes - keep dynamic routes last
router.get('/:id', getUserData);

export default router;