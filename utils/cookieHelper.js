/**
 * Helper function to generate consistent cookie options
 * @returns {Object} Cookie options object
 */
const getCookieOptions = () => {
    const isProduction = process.env.NODE_ENV === 'production';
    
    
    const domain = isProduction ? process.env.COOKIE_DOMAIN : undefined;
    
    return {
        maxAge: 1 * 24 * 60 * 60 * 1000, // 1 day
        httpOnly: true,
        secure: isProduction, // true in production for HTTPS
        sameSite: isProduction ? 'none' : 'lax',
        path: '/',
        ...(domain && { domain }), // Only include domain if it's defined
        partitioned: isProduction,
        priority: 'high'
    };
};

/**
 * Sets the authentication cookie in the response
 * @param {Object} res - Express response object
 * @param {String} token - JWT token to set in the cookie
 * @returns {Object} The response object with cookie set
 */
const setAuthCookie = (res, token) => {
    return res.cookie('token', token, getCookieOptions());
};

/**
 * Clears the authentication cookie in the response
 * @param {Object} res - Express response object
 * @returns {Object} The response object with cookie cleared
 */
const clearAuthCookie = (res) => {
    return res.clearCookie('token', {
        ...getCookieOptions(),
        maxAge: 0
    });
};

export { getCookieOptions, setAuthCookie, clearAuthCookie };
