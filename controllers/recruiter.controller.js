import Recruiter from "../models/recruiter.model.js";
import Job from "../models/job.model.js";
import JobApplication from "../models/jobApplication.model.js";
import jwt from "jsonwebtoken";
import { promisify } from "util";
import { uploadBufferToCloudinary } from "../utils/cloudinary.js";
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const signToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '30d'
    }
  );
};

const createSendToken = (recruiter, statusCode, res) => {
  try {
    const token = signToken(recruiter._id);
    
    // Set cookie options
    const cookieOptions = {
      expires: new Date(
        Date.now() + (process.env.JWT_COOKIE_EXPIRES_IN || 30) * 24 * 60 * 60 * 1000
      ),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    };

    // Remove password from output
    recruiter.password = undefined;

    // Set cookie
    res.cookie('jwt', token, cookieOptions);

    // Send response
    res.status(statusCode).json({
      status: "success",
      token,
      data: {
        recruiter,
      },
    });
  } catch (error) {
    console.error('Error in createSendToken:', error);
    throw error;
  }
};

const signup = async (req, res, next) => {
  try {
    const { companyName, email, password } = req.body;

    if (!companyName || !email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Please provide company name, email, and password",
      });
    }

    const existingRecruiter = await Recruiter.findOne({ email });
    if (existingRecruiter) {
      return res.status(400).json({
        status: "error",
        message: "Email already in use",
      });
    }

    let logoData = {};
    if (req.file) {
      try {
        logoData = await uploadBufferToCloudinary(req.file.buffer);
      } catch (uploadError) {
        console.error("Error uploading to Cloudinary:", uploadError);
        return res.status(400).json({
          status: "error",
          message: `Failed to upload logo: ${uploadError.message}`,
        });
      }
    }

    const newRecruiter = await Recruiter.create({
      companyName,
      email,
      password,
      ...(Object.keys(logoData).length > 0 && { companyLogo: logoData }),
    });

    createSendToken(newRecruiter, 201, res);
  } catch (error) {
    console.error("Error in signup controller:", error);
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1) Check if email and password exist
    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Please provide email and password",
      });
    }

    // 2) Check if recruiter exists and password is correct
    const recruiter = await Recruiter.findOne({ email }).select("+password");

    if (!recruiter || !(await recruiter.comparePassword(password, recruiter.password))) {
      return res.status(401).json({
        status: "error",
        message: "Incorrect email or password",
      });
    }

    // 3) If everything ok, send token to client
    createSendToken(recruiter, 200, res);
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

const getMe = async (req, res, next) => {
  try {
    const recruiter = await Recruiter.findById(req.recruiter._id);

    if (!recruiter) {
      return res.status(404).json({
        status: "error",
        message: "No recruiter found with that ID",
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        recruiter,
      },
    });
  } catch (error) {
    console.error('Error in getMe:', error);
    res.status(500).json({
      status: "error",
      message: 'An error occurred while fetching recruiter data',
    });
  }
};

const updateMe = async (req, res, next) => {
  try {
    const { companyName, email } = req.body;

    const updatedRecruiter = await Recruiter.findByIdAndUpdate(
      req.recruiter._id,
      { companyName, email },
      {
        new: true,
        runValidators: true,
      }
    );

    res.status(200).json({
      status: "success",
      data: {
        recruiter: updatedRecruiter,
      },
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

const updateApplicationStatus = async (req, res) => {
  try {
    const { applicationId, status } = req.body;

    // Validate input
    if (!applicationId || !status) {
      return res.status(400).json({
        status: "error",
        message: "Please provide both applicationId and status",
      });
    }

    // Validate status value
    if (!['pending', 'shortlisted', 'rejected', 'hired'].includes(status)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid status. Must be one of: pending, shortlisted, rejected, hired",
      });
    }

    // Find and update the application
    const updatedApplication = await JobApplication.findOneAndUpdate(
      {
        _id: applicationId,
        recruiter: req.recruiter._id,
      },
      { status },
      { new: true, runValidators: true }
    )
    .populate('applicantDetails', 'name email')
    .populate('job', 'title');

    if (!updatedApplication) {
      return res.status(404).json({
        status: "error",
        message: "Application not found or you don't have permission to update it",
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        application: {
          ...updatedApplication.toObject(),
          user: updatedApplication.applicantDetails
        },
      },
    });
  } catch (error) {
    console.error('Error updating application status:', error);
    res.status(500).json({
      status: "error",
      message: "An error occurred while updating the application status",
    });
  }
};

const getRecruiterApplications = async (req, res) => {
  const debugLog = [];
  const log = (...args) => {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
    ).join(' ');
    debugLog.push(`[${timestamp}] ${message}`);
    console.log(`[${timestamp}]`, ...args);
  };

  try {
    log('=== START DEBUG ===');
    log('1. Request headers:', req.headers);
    log('2. Authenticated user:', req.recruiter ? {
      _id: req.recruiter._id,
      email: req.recruiter.email,
      role: 'recruiter'
    } : 'No user in request');

    if (!req.recruiter) {
      log('2a. Error: No user found in request - check JWT middleware');
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    // Get jobs posted by this recruiter
    const jobs = await Job.find({ company: req.recruiter._id });
    log(`3. Found ${jobs.length} jobs for recruiter ${req.recruiter._id}`);
    
    if (!jobs || jobs.length === 0) {
      log('3a. No jobs found for this recruiter');
      return res.status(200).json({
        status: 'success',
        data: []
      });
    }

    const jobIds = jobs.map(job => job._id);
    log('4. Searching for applications with job IDs:', jobIds);

    // Get applications for these jobs
    const applications = await JobApplication.find({
      job: { $in: jobIds }
    })
    .populate('job', 'title companyName')
    .populate({
      path: 'applicantDetails',
      select: 'firstName lastName email phone resume',
      model: 'User'
    })
    .lean();
    
    log(`5. Found ${applications.length} applications`);
    
    // Format the response
    const formattedApplications = applications.map(app => {
      // Combine first and last name if they exist
      const fullName = app.applicantDetails?.firstName || app.applicantDetails?.lastName 
        ? `${app.applicantDetails.firstName || ''} ${app.applicantDetails.lastName || ''}`.trim()
        : null;
      
      // If applicantDetails exists, use it, otherwise create a basic user object
      const user = app.applicantDetails ? {
        _id: app.applicantDetails._id?.toString(),
        name: fullName || app.applicantDetails.email?.split('@')[0] || 'Anonymous',
        email: app.applicantDetails.email || 'N/A',
        phone: app.applicantDetails.phone || 'N/A',
        resume: app.resume || app.applicantDetails.resume || ''
      } : {
        _id: app.user,
        name: 'Anonymous',
        email: 'N/A',
        phone: 'N/A',
        resume: app.resume || ''
      };
      
      return {
        _id: app._id,
        status: app.status || 'pending',
        appliedAt: app.appliedAt || app.createdAt || new Date(),
        job: {
          _id: app.job?._id?.toString(),
          title: app.job?.title || 'N/A',
          company: app.job?.companyName || 'N/A'
        },
        user,
        resume: app.resume || '',
        coverLetter: app.coverLetter || ''
      };
    });

    log('6. Sending response with applications');
    return res.status(200).json({
      status: 'success',
      data: formattedApplications
    });

  } catch (error) {
    log('ERROR:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch recruiter applications',
      ...(process.env.NODE_ENV === 'development' && { 
        error: error.message,
        stack: error.stack 
      })
    });
  } finally {
    // Write logs to file
    try {
      const logDir = path.join(__dirname, '../../logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logFile = path.join(logDir, `recruiter-apps-${Date.now()}.log`);
      fs.writeFileSync(logFile, debugLog.join('\n'));
      console.log('Debug logs written to:', logFile);
    } catch (logError) {
      console.error('Failed to write debug logs:', logError);
    }
  }
};

export {
  signup,
  login,
  getMe,
  updateMe,
  updateApplicationStatus,
  getRecruiterApplications
};
