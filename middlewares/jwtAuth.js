import jwt from 'jsonwebtoken';
import Recruiter from '../models/recruiter.model.js';

// Promisify jwt.verify with explicit HS256 algorithm
const verifyToken = (token, secret) => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, secret, {
      algorithms: ['HS256'],
      ignoreExpiration: false
    }, (err, decoded) => {
      if (err) return reject(err);
      resolve(decoded);
    });
  });
};

const jwtAuth = async (req, res, next) => {
  try {
    // 1) Get token from header or cookie
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'You are not logged in! Please log in to get access.'
      });
    }

    // 2) Verify token
    let decoded;
    try {
      // Verify token with explicit algorithm
      decoded = await verifyToken(token, process.env.JWT_SECRET);
      console.log('Decoded token:', decoded); // Debug log
    } catch (error) {
      console.error('JWT Verification Error:', error);
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          status: 'error',
          message: 'Your session has expired. Please log in again.'
        });
      }
      
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid token. Please log in again.',
          details: error.message
        });
      }

      return res.status(401).json({
        status: 'error',
        message: 'Authentication failed. Please log in again.'
      });
    }

    // 3) Check if recruiter still exists
    const currentRecruiter = await Recruiter.findById(decoded.id).select('+passwordChangedAt');
    
    if (!currentRecruiter) {
      return res.status(401).json({
        status: 'error',
        message: 'The user belonging to this token no longer exists.'
      });
    }

    // 4) Check if user changed password after the token was issued
    if (currentRecruiter.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        status: 'error',
        message: 'User recently changed password! Please log in again.'
      });
    }

    // 5) GRANT ACCESS TO PROTECTED ROUTE
    req.recruiter = currentRecruiter;
    res.locals.recruiter = currentRecruiter;
    
    next();
  } catch (error) {
    console.error('Authentication Error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'An error occurred during authentication.'
    });
  }
};

export default jwtAuth;
