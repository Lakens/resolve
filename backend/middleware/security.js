import rateLimit from 'express-rate-limit';
import path from 'path';
import { isHostedProduction } from '../config.js';

// Rate limiting middleware
export const createRateLimiter = (windowMs = 15 * 60 * 1000, max = 400) => {
    return rateLimit({
        windowMs,
        max,
        message: 'Too many requests from this IP, please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
        validate: { xForwardedForHeader: false } // suppress false-positive warning from CRA proxy in dev
    });
};

// Path sanitization middleware
export const sanitizePath = (filePath) => {
    if (!filePath) return '';
    // Normalize the path and remove any attempts to traverse up
    return path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '').replace(/\\/g, '/');
};

// Enhanced cookie security middleware
export const secureCookies = (req, res, next) => {
    // Set secure cookie options in production
    if (isHostedProduction) {
        res.cookie('token', req.cookies.token, {
            httpOnly: true,
            secure: true,
            sameSite: 'none', // Changed from 'strict' to 'none' for cross-domain
            domain: '.resolve.pub', // Added domain for cross-subdomain support
            maxAge: 24 * 60 * 60  * 1000 // 24 hours
        });
    }
    next();
};

// Session cookie middleware
export const sessionConfig = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isHostedProduction,
        sameSite: isHostedProduction ? 'none' : 'lax',
        domain: isHostedProduction ? '.resolve.pub' : undefined,
        maxAge: 12 * 60 *60 * 1000 // 12 hours
    }
};

// Token validation middleware
export const validateToken = (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    // Add any additional token validation logic here
    // For example, checking token format, expiration, etc.
    
    req.token = token;
    next();
};
