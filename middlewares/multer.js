// middlewares/multer.js
import multer from "multer";

// Configure multer for memory storage
const memoryStorage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image")) {
    cb(null, true);
  } else {
    cb(new Error("Not an image! Please upload only images."), false);
  }
};

export const companyLogoUpload = multer({
  storage: memoryStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 1024 * 1024 * 5, // 5 MB file size limit
  },
}).single("logo");

// Resume file upload for resumes
export const resumeUpload = (req, res, next) => {
  const uploadResume = multer({
    storage: memoryStorage,
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Only PDF files are allowed'), false);
      }
    },
    limits: {
      fileSize: 1024 * 1024 * 5, // 5 MB file size limit
    },
  }).single('resume');
  
  // Handle the upload
  uploadResume(req, res, (err) => {
    if (err) {
      console.error('Resume upload error:', err);
      // Send error response and stop the middleware chain
      return res.status(400).json({
        success: false,
        message: err.message || 'Error uploading resume.',
        code: err.code
      });
    }
    
    // If no file was uploaded, return an error
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file was uploaded or file type is not allowed',
      });
    }
    
    // If everything is okay, proceed to the next middleware
    next();
  });
};