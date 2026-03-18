import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import Recruiter from "../models/recruiter.model.js";
import { uploadBufferToCloudinary } from "../utils/cloudinary.js";
import { companyLogoUpload } from "../middlewares/multer.js";
import transporter from "../utils/transporter.js";

const router = express.Router();

// JWT Sign Token
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
    algorithm: 'HS256'
  });
};

// Create and Send Token
const createSendToken = (recruiter, statusCode, res) => {
  const token = signToken(recruiter._id);

  // Remove password from output
  recruiter.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      recruiter
    }
  });
};

// @route   POST /api/v1/recruiter/auth/signup
// @desc    Register a new recruiter
// @access  Public
router.post('/signup', companyLogoUpload, async (req, res) => {
  try {
    const { companyName, email, password } = req.body;

    // Validation
    if (!companyName || !email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide company name, email, and password'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 6 characters'
      });
    }

    // Check if recruiter already exists
    const existingRecruiter = await Recruiter.findOne({ email });
    if (existingRecruiter) {
      return res.status(400).json({
        status: 'error',
        message: 'Email already exists'
      });
    }

    // Handle logo upload if provided
    let logoData = {};
    if (req.file) {
      try {
        logoData = await uploadBufferToCloudinary(req.file.buffer);
      } catch (uploadError) {
        console.error("Error uploading to Cloudinary:", uploadError);
        return res.status(400).json({
          status: 'error',
          message: `Failed to upload logo: ${uploadError.message}`,
        });
      }
    }

    // Create new recruiter (password will be hashed by model pre-save hook)
    const newRecruiter = await Recruiter.create({
      companyName: companyName.trim(),
      email: email.trim().toLowerCase(),
      password: password, // Plain password - model will hash it
      ...(Object.keys(logoData).length > 0 && { companyLogo: logoData }),
    });

    // Generate email verification OTP
    console.log('🔑 Generating email verification OTP...');
    const verificationOTP = newRecruiter.createEmailVerificationOTP();
    console.log('Generated OTP:', verificationOTP);
    console.log('OTP expires at:', newRecruiter.emailVerificationOTPExpires);

    await newRecruiter.save({ validateBeforeSave: false });
    console.log('✅ OTP saved to database');

    const mailOptions = {
      from: process.env.SMTP_USER,
      to: newRecruiter.email,
      subject: 'Email Verification OTP - Job Portal',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb; text-align: center;">Welcome to Job Portal!</h2>
          <p>Please verify your email address to complete your registration.</p>

          <div style="background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
            <h3 style="margin: 0 0 10px 0; color: #495057;">Your Verification Code</h3>
            <div style="font-size: 32px; font-weight: bold; color: #2563eb; letter-spacing: 4px; margin: 10px 0;">
              ${verificationOTP}
            </div>
            <p style="margin: 10px 0 0 0; color: #6c757d; font-size: 14px;">
              This code will expire in 10 minutes
            </p>
          </div>

          <p style="color: #6c757d; font-size: 14px;">
            If you didn't create an account, please ignore this email.
          </p>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; text-align: center; color: #6c757d; font-size: 12px;">
            <p>This is an automated message from Job Portal. Please do not reply to this email.</p>
          </div>
        </div>
      `
    };

    try {
      console.log('📧 Attempting to send verification email...');
      console.log('📧 From:', process.env.SMTP_USER);
      console.log('📧 To:', newRecruiter.email);
      console.log('📧 OTP:', verificationOTP);

      const emailResult = await transporter.sendMail(mailOptions);
      console.log('✅ Verification email sent successfully:', emailResult.messageId);
      console.log('📧 Email sent to:', newRecruiter.email);

      res.status(201).json({
        status: 'success',
        message: 'Account created successfully! Please check your email for the verification code.',
        data: {
          recruiter: {
            _id: newRecruiter._id,
            companyName: newRecruiter.companyName,
            email: newRecruiter.email,
            isVerified: false
          }
        }
      });
    } catch (emailError) {
      console.error('❌ Error sending verification email:');
      console.error('Error code:', emailError.code);
      console.error('Error message:', emailError.message);
      console.error('Error response:', emailError.response);
      console.error('SMTP Response:', emailError.responseCode);
      console.error('SMTP Command:', emailError.command);
      // Still create the account but inform the user about email issue
      res.status(201).json({
        status: 'success',
        message: 'Account created successfully! However, there was an issue sending the verification email. Please contact support.',
        data: {
          recruiter: {
            _id: newRecruiter._id,
            companyName: newRecruiter.companyName,
            email: newRecruiter.email,
            isVerified: false
          }
        }
      });
    }

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong during registration'
    });
  }
});

// @route   POST /api/v1/recruiter/auth/login
// @desc    Login recruiter
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide email and password'
      });
    }

    // Check if recruiter exists and get password
    console.log('🔍 Login attempt for email:', email.trim().toLowerCase());
    const recruiter = await Recruiter.findOne({ email: email.trim().toLowerCase() }).select('+password');

    if (!recruiter) {
      console.log('❌ Recruiter not found for email:', email.trim().toLowerCase());
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    console.log('✅ Recruiter found:', recruiter._id);
    console.log('🔍 isVerified status:', recruiter.isVerified);

    // Check if email is verified
    if (!recruiter.isVerified) {
      console.log('❌ Email not verified for recruiter:', recruiter._id);
      return res.status(401).json({
        status: 'error',
        message: 'Please verify your email address before logging in. Check your email for the verification code.'
      });
    }

    console.log('✅ Email is verified, proceeding with password check');

    // Check password
    console.log('🔐 Password check for recruiter:', recruiter._id);
    console.log('📝 Password provided (length):', password.length);
    console.log('💾 Stored hash starts with:', recruiter.password.substring(0, 10) + '...');

    const isPasswordValid = await bcrypt.compare(password, recruiter.password);
    console.log('🔍 Password comparison result:', isPasswordValid);

    if (!isPasswordValid) {
      console.log('❌ Password validation failed');
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    console.log('✅ Password validation successful');

    // Send token
    createSendToken(recruiter, 200, res);

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong during login'
    });
  }
});

// @route   GET /api/v1/recruiter/auth/me
// @desc    Get current recruiter profile
// @access  Private
router.get('/me', async (req, res) => {
  try {
    // Get token from header
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Not authorized'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // Get recruiter
    const recruiter = await Recruiter.findById(decoded.id);
    if (!recruiter) {
      return res.status(404).json({
        status: 'error',
        message: 'Recruiter not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        recruiter
      }
    });

  } catch (error) {
    console.error('Get me error:', error);
    res.status(401).json({
      status: 'error',
      message: 'Not authorized'
    });
  }
});

// @route   POST /api/v1/recruiter/auth/verify-otp
// @desc    Verify recruiter email with OTP
// @access  Public
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    console.log('🔍 OTP verification attempt:');
    console.log('Email:', email);
    console.log('OTP provided:', otp);

    if (!email || !otp) {
      return res.status(400).json({
        status: 'error',
        message: 'Email and OTP are required'
      });
    }

    const recruiter = await Recruiter.findOne({
      email: email.trim().toLowerCase(),
      emailVerificationOTP: otp,
      emailVerificationOTPExpires: { $gt: Date.now() }
    });

    console.log('Recruiter found:', !!recruiter);
    if (recruiter) {
      console.log('OTP matches:', recruiter.emailVerificationOTP === otp);
      console.log('OTP expires:', recruiter.emailVerificationOTPExpires);
      console.log('Current time:', new Date());
      console.log('OTP expired?', recruiter.emailVerificationOTPExpires < new Date());
    }

    if (!recruiter) {
      console.log('❌ Invalid OTP or email');
      return res.status(400).json({
        status: 'error',
        message: 'Invalid OTP or OTP has expired'
      });
    }

    // Mark email as verified
    console.log('🔄 Before verification - isVerified:', recruiter.isVerified);
    recruiter.isVerified = true;
    recruiter.emailVerificationOTP = undefined;
    recruiter.emailVerificationOTPExpires = undefined;

    console.log('💾 Saving recruiter with isVerified = true...');
    const savedRecruiter = await recruiter.save({ validateBeforeSave: false });
    console.log('✅ Recruiter saved successfully');
    console.log('🔍 After save - isVerified:', savedRecruiter.isVerified);

    // Double-check by fetching from database
    const verifiedRecruiter = await Recruiter.findById(recruiter._id);
    console.log('🔍 Database check - isVerified:', verifiedRecruiter.isVerified);

    console.log('✅ Email verified successfully for:', email);

    res.status(200).json({
      status: 'success',
      message: 'Email verified successfully! You can now log in to your account.',
      data: {
        recruiter: {
          _id: recruiter._id,
          companyName: recruiter.companyName,
          email: recruiter.email,
          isVerified: true
        }
      }
    });

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong during OTP verification'
    });
  }
});

// @route   POST /api/v1/recruiter/auth/forgot-password
// @desc    Send password reset email to recruiter
// @access  Public
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide an email address'
      });
    }

    // Find recruiter by email
    const recruiter = await Recruiter.findOne({ email: email.trim().toLowerCase() });

    if (!recruiter) {
      // Don't reveal if email exists or not for security
      return res.status(200).json({
        status: 'success',
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    // Check if email is verified
    if (!recruiter.isVerified) {
      return res.status(400).json({
        status: 'error',
        message: 'Please verify your email address first before resetting password.'
      });
    }

    // Generate password reset token
    const resetToken = recruiter.createPasswordResetToken();
    await recruiter.save({ validateBeforeSave: false });

    // Send password reset email
    const resetURL = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.SMTP_USER,
      to: recruiter.email,
      subject: 'Password Reset - Job Portal',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb; text-align: center;">Password Reset Request</h2>
          <p>You requested a password reset for your Job Portal account.</p>
          <p>Please click the button below to reset your password:</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetURL}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Reset Password
            </a>
          </div>

          <p style="color: #6c757d; font-size: 14px;">
            This link will expire in 10 minutes for security reasons.
          </p>

          <p style="color: #6c757d; font-size: 14px;">
            If you didn't request this password reset, please ignore this email.
          </p>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; text-align: center; color: #6c757d; font-size: 12px;">
            <p>This is an automated message from Job Portal. Please do not reply to this email.</p>
          </div>
        </div>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log('✅ Password reset email sent to:', recruiter.email);

      res.status(200).json({
        status: 'success',
        message: 'Password reset link sent to your email!'
      });
    } catch (emailError) {
      console.error('❌ Error sending password reset email:', emailError);

      // Clear the reset token if email fails
      recruiter.passwordResetToken = undefined;
      recruiter.passwordResetExpires = undefined;
      await recruiter.save({ validateBeforeSave: false });

      return res.status(500).json({
        status: 'error',
        message: 'There was an error sending the email. Please try again later.'
      });
    }

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong. Please try again later.'
    });
  }
});

// @route   POST /api/v1/recruiter/auth/reset-password
// @desc    Reset recruiter password using token
// @access  Public
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password, passwordConfirm } = req.body;

    if (!token || !password || !passwordConfirm) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide token, password, and password confirmation'
      });
    }

    if (password !== passwordConfirm) {
      return res.status(400).json({
        status: 'error',
        message: 'Passwords do not match'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 6 characters long'
      });
    }

    // Hash the token to compare with stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find recruiter with valid reset token
    const recruiter = await Recruiter.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!recruiter) {
      return res.status(400).json({
        status: 'error',
        message: 'Token is invalid or has expired'
      });
    }

    // Update password
    recruiter.password = password;
    recruiter.passwordResetToken = undefined;
    recruiter.passwordResetExpires = undefined;
    recruiter.passwordChangedAt = Date.now();

    await recruiter.save();

    console.log('✅ Password reset successful for:', recruiter.email);

    res.status(200).json({
      status: 'success',
      message: 'Password reset successful! You can now log in with your new password.'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong. Please try again later.'
    });
  }
});

export default router;