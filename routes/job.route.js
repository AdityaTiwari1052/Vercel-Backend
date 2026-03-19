import express from "express";
import {
  getAllJobs,
  getJobById,
  postJob,
  getJobsByRecruiter,
  toggleJobVisibility,
  deleteJob,
} from "../controllers/job.controller.js";
import jwtAuth from "../middlewares/jwtAuth.js";

const router = express.Router();

// Public routes
router.get("/all", getAllJobs);
router.get("/:id", getJobById);

// Protected routes (require recruiter authentication)
router.get("/recruiter/my-jobs", jwtAuth, getJobsByRecruiter);
router.post("/", jwtAuth, postJob);
router.patch("/:id/visibility", jwtAuth, toggleJobVisibility);
router.delete("/:id", jwtAuth, deleteJob);

export default router;
