import User from '../models/user.model.js';
import Job from '../models/job.model.js';
import JobApplication from '../models/jobApplication.model.js';
import cloudinary from "../utils/cloudinary.js";
import AppError from '../utils/appError.js';

export const getUserData = async (req, res, next) => {
    try {
        const paramId = req.params.id;

        let userId;

        // If the parameter is "me", get the authenticated user's ID
        if (paramId === 'me') {
            userId = req.auth?.userId || req.user?.id;
            if (!userId) {
                return next(new AppError('User not authenticated', 401));
            }
        } else {
            // Otherwise, use the provided ID
            userId = paramId;
        }

        // Find user by clerkUserId if it's "me", otherwise by _id
        let user;
        if (paramId === 'me') {
            user = await User.findOne({ clerkUserId: userId }).select('-__v');
        } else {
            user = await User.findById(userId).select('-__v');
        }

        // Check if user exists
        if (!user) {
            return next(new AppError('No user found', 404));
        }

        // Return user data
        res.status(200).json({
            status: 'success',
            data: {
                user
            }
        });

    } catch (error) {
        console.error('Error in getUserData:', error);
        next(new AppError(error.message || 'Failed to get user data', 500));
    }
};

export const getAppliedJobs = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const application = await JobApplication.find({ user: userId }).sort({ createdAt: -1 }).populate({
            path: 'job',
            options: { sort: { createdAt: -1 } },
            populate: {
                path: 'company',
                options: { sort: { createdAt: -1 } },
            }
        });
        if (!application) {
            return res.status(404).json({
                message: "No Applications",
                success: false
            })
        };
        return res.status(200).json({
            application,
            success: true
        })
    } catch (error) {
        console.error('Error in getAppliedJobs:', error);
        next(new AppError(error.message || 'Failed to get applied jobs', 500));
    }
}

export const applyForJob = async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const { coverLetter = '' } = req.body;
        
        // Get user ID from the authenticated request
        const userId = req.auth?.userId || req.user?.id;
        if (!userId) {
            return next(new AppError('User not authenticated', 401));
        }

        // Find the user to get their resume
        const user = await User.findOne({ clerkUserId: userId });
        if (!user) {
            return next(new AppError('User not found', 404));
        }

        // Check if user has a resume
        if (!user.resume) {
            return next(new AppError('Please upload a resume before applying', 400));
        }

        // Check if job exists
        const job = await Job.findById(jobId);
        if (!job) {
            return next(new AppError('Job not found', 404));
        }

        // Check if already applied
        const existingApplication = await JobApplication.findOne({
            user: userId,
            job: jobId
        });

        if (existingApplication) {
            return next(new AppError('You have already applied to this job', 400));
        }

        // Create new application with user's resume
        const application = await JobApplication.create({
            user: userId,
            job: jobId,
            recruiter: job.created_by,
            resume: user.resume,
            coverLetter,
            status: 'applied'
        });

        // Add the application to the job's applications array
        job.applications.push(application._id);
        await job.save();

        // Populate the application with user and job details using virtuals
        const populatedApp = await JobApplication.findById(application._id)
            .populate('jobDetails')
            .populate('applicantDetails', 'firstName lastName email profileImageUrl')
            .lean();

        res.status(201).json({
            success: true,
            message: 'Application submitted successfully',
            data: {
                application: {
                    ...populatedApp,
                    job: populatedApp.jobDetails,
                    user: populatedApp.applicantDetails
                }
            }
        });

    } catch (error) {
        console.error('Error in applyForJob:', error);
        next(new AppError(error.message || 'Failed to submit application', 500));
    }
};

export const uploadResume = async (req, res, next) => {
    try {
        console.log('🔄 Resume upload controller called');
        console.log('🔍 Request auth:', req.auth);
        console.log('🔍 Request user:', req.user);

        // Get user ID from the authenticated request
        const userId = req.auth?.userId || req.user?.id;
        console.log('🔑 User ID:', userId);

        if (!userId) {
            return next(new AppError('User not authenticated', 401));
        }

        // Check if file was uploaded
        if (!req.file) {
            return next(new AppError('No file uploaded', 400));
        }

        console.log('Uploading resume for user:', userId);
        console.log('File details:', {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size
        });

        // Upload file to Cloudinary
        const cloudinaryResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    resource_type: 'raw',
                    folder: 'resumes',
                    public_id: `resume_${userId}_${Date.now()}`,
                    format: 'pdf'
                },
                (error, result) => {
                    if (error) {
                        console.error('Cloudinary upload error:', error);
                        reject(error);
                    } else {
                        console.log('Cloudinary upload success:', result.secure_url);
                        resolve(result);
                    }
                }
            );
            stream.end(req.file.buffer);
        });

        // Get resume name from request body or use default
        const resumeName = req.body.resumeName || req.file.originalname || 'My Resume';

        // Update user's resume field in database
        const updatedUser = await User.findOneAndUpdate(
            { clerkUserId: userId },
            {
                resume: cloudinaryResult.secure_url,
                resumeName: resumeName,
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!updatedUser) {
            return next(new AppError('User not found', 404));
        }

        console.log('Resume uploaded successfully for user:', userId);

        res.status(200).json({
            success: true,
            message: 'Resume uploaded successfully',
            data: {
                resumeUrl: cloudinaryResult.secure_url,
                user: {
                    id: updatedUser._id,
                    resume: updatedUser.resume,
                    resumeName: updatedUser.resumeName
                }
            }
        });

    } catch (error) {
        console.error('Error in uploadResume:', error);
        next(new AppError(error.message || 'Failed to upload resume', 500));
    }
};

export const deleteResume = async (req, res, next) => {
    try {
        // Get user ID from the authenticated request
        const userId = req.auth?.userId || req.user?.id;
        if (!userId) {
            return next(new AppError('User not authenticated', 401));
        }

        console.log('Deleting resume for user:', userId);

        // Find the user and get their current resume URL
        const user = await User.findOne({ clerkUserId: userId });
        if (!user) {
            return next(new AppError('User not found', 404));
        }

        if (!user.resume) {
            return next(new AppError('No resume found to delete', 404));
        }

        // Extract the public_id from the Cloudinary URL for deletion
        const resumeUrl = user.resume;
        const publicIdMatch = resumeUrl.match(/\/resumes\/([^.]+)/);
        if (publicIdMatch) {
            const publicId = `resumes/${publicIdMatch[1]}`;

            try {
                // Delete from Cloudinary
                await new Promise((resolve, reject) => {
                    cloudinary.uploader.destroy(publicId, (error, result) => {
                        if (error) {
                            console.error('Cloudinary delete error:', error);
                            // Don't fail the whole operation if Cloudinary delete fails
                            resolve();
                        } else {
                            console.log('Cloudinary delete success:', result);
                            resolve();
                        }
                    });
                });
            } catch (cloudinaryError) {
                console.error('Error deleting from Cloudinary:', cloudinaryError);
                // Continue with database update even if Cloudinary delete fails
            }
        }

        // Update user's resume field to null in database
        const updatedUser = await User.findOneAndUpdate(
            { clerkUserId: userId },
            {
                resume: null,
                resumeName: null,
                updatedAt: new Date()
            },
            { new: true }
        );

        console.log('Resume deleted successfully for user:', userId);

        res.status(200).json({
            success: true,
            message: 'Resume deleted successfully',
            data: {
                user: {
                    id: updatedUser._id,
                    resume: updatedUser.resume
                }
            }
        });

    } catch (error) {
        console.error('Error in deleteResume:', error);
        next(new AppError(error.message || 'Failed to delete resume', 500));
    }
};

