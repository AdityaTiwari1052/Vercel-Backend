import { Webhook } from 'svix';
import User from '../models/user.model.js';

export const handleClerkWebhook = async (req, res) => {
    console.log('=== NEW WEBHOOK REQUEST ===');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Raw body:', req.rawBody);
    console.log('Parsed body:', req.body);

    try {
        const svixId = req.headers['svix-id'];
        const svixTimestamp = req.headers['svix-timestamp'];
        const svixSignature = req.headers['svix-signature'];
        
        // Check if this is a test request
        const isTestRequest = req.isTest || svixSignature === 'test-signature';
        
        if (!isTestRequest && (!svixId || !svixTimestamp || !svixSignature)) {
            console.error('Missing required headers');
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required headers',
                headers: { svixId, svixTimestamp, svixSignature }
            });
        }

        const payload = req.body;
        if (!payload) {
            console.error('Missing request body');
            return res.status(400).json({ 
                success: false, 
                error: 'Missing request body' 
            });
        }

        let evt;
        
        try {
            if (isTestRequest) {
                console.log('Processing test webhook request');
                evt = payload;
            } else {
                const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET);
                evt = wh.verify(JSON.stringify(payload), {
                    'svix-id': svixId,
                    'svix-timestamp': svixTimestamp,
                    'svix-signature': svixSignature
                });
                console.log('Webhook verified successfully');
            }
            
            console.log('Event type:', evt.type);
            console.log('Event data:', JSON.stringify(evt.data, null, 2));

            // Handle the event
            const eventType = evt.type;
            console.log('Processing event type:', eventType);

            if (eventType === 'user.created' || eventType === 'user.updated') {
                const { id, first_name, last_name, email_addresses } = evt.data;
                const email = email_addresses?.[0]?.email_address;
                
                console.log('Processing user:', { id, first_name, last_name, email });

                if (!id || !email) {
                    console.error('Missing required user data');
                    return res.status(400).json({ 
                        success: false,
                        error: 'Missing required user data',
                        data: { id, email }
                    });
                }

                // Check if user exists
                const existingUser = await User.findOne({ clerkUserId: id });
                
                if (existingUser) {
                    // Update existing user
                    existingUser.firstName = first_name || existingUser.firstName;
                    existingUser.lastName = last_name || existingUser.lastName;
                    existingUser.email = email;
                    await existingUser.save();
                    console.log('Updated user in database:', existingUser);
                    return res.status(200).json({ 
                        success: true, 
                        message: 'User updated',
                        user: existingUser
                    });
                } else {
                    // Create new user
                    const newUser = await User.create({
                        clerkUserId: id,
                        firstName: first_name || '',
                        lastName: last_name || '',
                        email: email
                    });
                    console.log('Created new user in database:', newUser);
                    return res.status(201).json({ 
                        success: true, 
                        message: 'User created',
                        user: newUser
                    });
                }
            }

            return res.status(200).json({ 
                success: true, 
                message: 'Webhook received but no action taken',
                event: eventType
            });
            
        } catch (err) {
            console.error('Webhook processing error:', err);
            return res.status(400).json({ 
                success: false,
                error: 'Error processing webhook',
                details: err.message
            });
        }
    } catch (error) {
        console.error('Error in webhook handler:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
};