const isAuthenticated = (requiredUserType) => {
    return async (req, res, next) => {
        try {
            // Get auth data using the recommended auth() function
            const authData = await req.auth?.();
            
            // Check if user is authenticated
            if (!authData || !authData.userId) {
                return res.status(401).json({ 
                    success: false,
                    message: 'Not authenticated' 
                });
            }

            // Get user from request (attached by Clerk middleware)
            const user = authData;

            // Check if user type matches required type if specified
            if (requiredUserType) {
                const userType = user.publicMetadata?.role || user.publicMetadata?.type;
                if (userType !== requiredUserType) {
                    return res.status(403).json({
                        success: false,
                        message: `Access denied. Requires ${requiredUserType} role.`
                    });
                }
            }

            // Attach user to request object for downstream middleware
            req.user = {
                id: user.userId,
                sessionId: user.sessionId,
                type: user.publicMetadata?.role || user.publicMetadata?.type
            };

            next();
        } catch (error) {
            console.error('Authentication error:', error);
            return res.status(500).json({
                success: false,
                message: 'Authentication failed',
                ...(process.env.NODE_ENV === 'development' && { error: error.message })
            });
        }
    };
};

export default isAuthenticated;