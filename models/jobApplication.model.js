import mongoose from 'mongoose';

const jobApplicationSchema = new mongoose.Schema({
    user: {
        type: String, 
        required: true
    },
    job: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
        required: true
    },
    recruiter: {
        type: String, 
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'shortlisted', 'rejected', 'hired', 'applied'],
        default: 'applied'
    },
    resume: {
        type: String,
        default: ''
    },
    coverLetter: {
        type: String,
        default: ''
    },
    appliedAt: {
        type: Date,
        default: Date.now
    },
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for user details
jobApplicationSchema.virtual('applicantDetails', {
    ref: 'User',
    localField: 'user',
    foreignField: 'clerkUserId',
    justOne: true
});

// Virtual for job details
jobApplicationSchema.virtual('jobDetails', {
    ref: 'Job',
    localField: 'job',
    foreignField: '_id',
    justOne: true
});

// Add index for faster queries
jobApplicationSchema.index({ user: 1, job: 1 }, { unique: true });
jobApplicationSchema.index({ recruiter: 1, status: 1 });

const JobApplication = mongoose.model('JobApplication', jobApplicationSchema);

export default JobApplication;
