const express = require('express');
const {createProxyMiddleware} = require('http-proxy-middleware');
const util = require('util');
const debug = require('debug')('pelo-proxy');

// Enable debug logging
debug.enabled = true;

// Log all incoming requests to the serverless function
debug('Serverless Function Entry: %O',{
    time: new Date().toISOString(),
    env: process.env.NODE_ENV
});

const app = express();

// Request logger
app.use((req,res,next) => {
    debug('Incoming Request: %O',{
        method: req.method,
        url: req.url,
        originalUrl: req.originalUrl,
        path: req.path,
        headers: req.headers
    });
    next();
});

// Shared proxy options
const commonConfig = {
    target: 'https://api.onepeloton.com',
    changeOrigin: true,
    logLevel: 'debug',
    headers: {
        'Origin': 'https://members.onepeloton.com',
        'Peloton-Platform': 'web'
    },
    cookieDomainRewrite: {
        '.onepeloton.com': ''
    },
    onProxyRes: function(proxyRes,req,res) {
        console.log('🔄 Proxy Response:',{
            statusCode: proxyRes.statusCode,
            path: req.path,
            originalUrl: req.originalUrl,
            targetUrl: req.url
        });

        // Handle cookies and session
        if(proxyRes.headers['set-cookie']) {
            const cookies = proxyRes.headers['set-cookie'].map(cookie =>
                cookie.replace(/Domain=[^;]+/,'')
            );
            proxyRes.headers['set-cookie'] = cookies;
        }
    },
    onProxyReq: function(proxyReq,req,res) {
        console.log('📤 Proxy Request:',{
            path: req.path,
            originalUrl: req.originalUrl,
            targetPath: proxyReq.path,
            headers: req.headers
        });

        // Ensure credentials are forwarded
        if(req.headers.cookie) {
            proxyReq.setHeader('Cookie',req.headers.cookie);
        }
    },
    onError: function(err,req,res) {
        console.error('❌ Proxy Error:',{
            message: err.message,
            stack: err.stack,
            path: req.path,
            originalUrl: req.originalUrl
        });
    }
};

// API endpoints proxy
app.use('/api',createProxyMiddleware({
    ...commonConfig,
    pathRewrite: (path) => {
        // Log the path transformation
        const newPath = path.replace(/^\/api/,'');
        console.log('Path rewrite:',{original: path,transformed: newPath});
        return newPath;
    }
}));

// Auth endpoints proxy
app.use('/auth',createProxyMiddleware({
    ...commonConfig,
    pathRewrite: (path) => {
        // Log the path transformation
        const newPath = path.replace(/^\/auth\/?/,'/auth/');
        console.log('Path rewrite:',{original: path,transformed: newPath});
        return newPath;
    }
}));

// Catch unmatched routes
app.use((req,res,next) => {
    console.log('❓ Unmatched Route:',{
        method: req.method,
        url: req.url,
        originalUrl: req.originalUrl,
        path: req.path
    });
    next();
});

// Error handler
app.use((err,req,res,next) => {
    console.error('❌ Express Error:',{
        message: err.message,
        stack: err.stack,
        path: req.path,
        originalUrl: req.originalUrl
    });
    res.status(500).json({error: 'Proxy server error',details: err.message});
});

module.exports = app;
