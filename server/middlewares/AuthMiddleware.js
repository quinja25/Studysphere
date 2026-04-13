const { verify } = require('jsonwebtoken');

const validateToken = (req, res, next) => {
    // Accept token from Authorization header, legacy accessToken header,
    // query param, or body (body needed for sendBeacon which cannot set headers)
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const accessToken = bearerToken || req.header('accessToken') || req.query.accessToken || req.body?.accessToken;
    if (!accessToken) return res.status(401).json({ error: "Access denied. Please log in." });

    try {
        const decoded = verify(accessToken, process.env.JWT_SECRET);
        // Only accept access tokens — reject refresh and reset tokens
        if (decoded.type !== 'access') {
            return res.status(401).json({ error: 'Invalid token type' });
        }
        req.user = decoded;
        return next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid or expired token. Please log in again." });
    }
};

module.exports = { validateToken };