import express from 'express';
import User from '../models/user.model.js';
import { handleClerkWebhook } from '../controllers/webhook.controller.js';

const router = express.Router();

// Test database connection
router.get('/test-db', async (req, res) => {
    try {
        const userCount = await User.countDocuments();
        return res.status(200).json({ 
            success: true, 
            message: 'Database connection successful',
            userCount
        });
    } catch (error) {
        console.error('Database connection error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Database connection failed',
            details: error.message 
        });
    }
});

// Middleware to handle raw body
const rawBodySaver = (req, res, buf, encoding) => {
    if (buf && buf.length) {
        req.rawBody = buf.toString(encoding || 'utf8');
    }
};

// Clerk webhook endpoint
router.post('/clerk', 
    // Parse raw body
    express.raw({ 
        verify: rawBodySaver,
        type: 'application/json' 
    }),
    
    // Process the request
    (req, res, next) => {
        try {
            // Skip verification for test requests
            if (req.headers['svix-signature'] === 'test-signature') {
                console.log('Test webhook - skipping verification');
                req.isTest = true;
            }
            
            // Parse the raw body to JSON
            if (req.rawBody) {
                req.body = JSON.parse(req.rawBody);
            }
            next();
        } catch (err) {
            console.error('Error parsing webhook body:', err);
            return res.status(400).json({ 
                success: false,
                error: 'Invalid JSON payload',
                details: err.message 
            });
        }
    },
    
    // Handle the webhook
    handleClerkWebhook
);

export default router;