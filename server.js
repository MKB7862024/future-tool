import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createProxyMiddleware } from 'http-proxy-middleware';
import axios from 'axios';
import FormData from 'form-data';
import archiver from 'archiver';
import fs from 'fs-extra';
import { existsSync, mkdirSync } from 'fs';

// Import professional backend modules
import productRoutes from './src/routes/productRoutes.js';
import linkRoutes from './src/routes/linkRoutes.js';
import orderRoutes from './src/routes/orderRoutes.js';
import designRoutes from './src/routes/designRoutes.js';
import { errorHandler, notFoundHandler } from './src/middleware/errorHandler.js';
import { ApiResponse } from './src/utils/response.js';
import { initAuth } from './src/middleware/auth.js';
import { connectDB } from './src/config/database.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create upload directories
const UPLOADS_DIR = join(__dirname, 'uploads');
const ORDERS_DIR = join(UPLOADS_DIR, 'orders');
const DESIGNS_DIR = join(UPLOADS_DIR, 'designs');
const CUSTOMER_DESIGNS_DIR = join(UPLOADS_DIR, 'customer-designs'); // Customer designs folder for WordPress access
const IMAGES_DIR = join(UPLOADS_DIR, 'images');
const FONTS_DIR = join(UPLOADS_DIR, 'fonts');
const CLIPART_DIR = join(UPLOADS_DIR, 'clipart');
const TEMPLATES_DIR = join(UPLOADS_DIR, 'templates');
const DATA_DIR = join(__dirname, 'data');
const LINKS_DB = join(DATA_DIR, 'links.json');
const PRODUCTS_DB = join(DATA_DIR, 'products.json');

// Ensure directories exist
[UPLOADS_DIR, ORDERS_DIR, DESIGNS_DIR, CUSTOMER_DESIGNS_DIR, IMAGES_DIR, FONTS_DIR, CLIPART_DIR, TEMPLATES_DIR, DATA_DIR].forEach(dir => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log('Created directory:', dir);
  }
});

// Initialize products database if it doesn't exist
if (!existsSync(PRODUCTS_DB)) {
  fs.writeJsonSync(PRODUCTS_DB, [], { spaces: 2 });
}

const app = express();
const PORT = process.env.BACKEND_PORT || 5000;
const WORDPRESS_URL = process.env.WORDPRESS_URL || 'http://localhost:8080';
const REACT_APP_URL = process.env.REACT_APP_URL || 'http://localhost:3000';
const WORDPRESS_SECRET_TOKEN = process.env.WORDPRESS_SECRET_TOKEN || 'futuretech'; // SiteGround Security token
const WOOCOMMERCE_CONSUMER_KEY = process.env.WOOCOMMERCE_CONSUMER_KEY || '';
const WOOCOMMERCE_CONSUMER_SECRET = process.env.WOOCOMMERCE_CONSUMER_SECRET || '';

// Helper function to add secret token to WordPress URLs
// Note: JWT endpoints might not accept query parameters, so we skip them for JWT routes
const addSecretToken = (url, skipForJWT = false) => {
  if (!WORDPRESS_SECRET_TOKEN) return url;
  // Skip secret token for JWT endpoints as they might not accept query parameters
  if (skipForJWT && url.includes('/jwt-auth/')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}sgs-token=${WORDPRESS_SECRET_TOKEN}`;
};

// Log configuration on startup
console.log('\n=== Server Configuration ===');
console.log('WordPress URL:', WORDPRESS_URL);
console.log('React App URL:', REACT_APP_URL);
console.log('Backend Port:', PORT);
console.log('WordPress Secret Token:', WORDPRESS_SECRET_TOKEN ? '***configured***' : 'not set');
console.log('WooCommerce API Key:', WOOCOMMERCE_CONSUMER_KEY ? '***configured***' : 'not set');
console.log('WooCommerce API Secret:', WOOCOMMERCE_CONSUMER_SECRET ? '***configured***' : 'not set');
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('===========================\n');

// Middleware
app.use(cors({
  origin: [REACT_APP_URL, 'http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Serve static files from React build (for production)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '../frontend/build')));
}

// WordPress REST API Proxy
// This proxies all WordPress REST API requests to the WordPress site
const wordpressProxy = createProxyMiddleware({
  target: WORDPRESS_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/wordpress': '', // Remove /api/wordpress prefix
  },
  onProxyReq: (proxyReq, req, res) => {
    // Forward authentication headers
    if (req.headers.authorization) {
      proxyReq.setHeader('Authorization', req.headers.authorization);
    }
    if (req.headers['x-wp-nonce']) {
      proxyReq.setHeader('X-WP-Nonce', req.headers['x-wp-nonce']);
    }
    // Forward cookies for WordPress authentication
    if (req.headers.cookie) {
      proxyReq.setHeader('Cookie', req.headers.cookie);
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    // Forward cookies from WordPress
    if (proxyRes.headers['set-cookie']) {
      res.setHeader('Set-Cookie', proxyRes.headers['set-cookie']);
    }
  },
  logLevel: 'debug',
});

// Proxy WordPress REST API requests
app.use('/api/wordpress', wordpressProxy);

// Design Tool API Routes
// These routes handle design tool specific operations and can interact with WordPress

/**
 * Get WordPress site info
 */
app.get('/api/wordpress/info', async (req, res) => {
  try {
    const response = await axios.get(addSecretToken(`${WORDPRESS_URL}/wp-json/`), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('WordPress info error:', error.message);
    res.status(500).json({ error: 'Failed to connect to WordPress' });
  }
});

// Helper function to get WooCommerce auth header
const getWooCommerceAuth = () => {
  if (WOOCOMMERCE_CONSUMER_KEY && WOOCOMMERCE_CONSUMER_SECRET) {
    // Use Basic Auth for WooCommerce API
    const credentials = Buffer.from(`${WOOCOMMERCE_CONSUMER_KEY}:${WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64');
    return `Basic ${credentials}`;
  }
  return null;
};

// Store app-level dependencies for routes
app.locals.wordpressUrl = WORDPRESS_URL;
app.locals.addSecretToken = addSecretToken;
app.locals.getWooCommerceAuth = getWooCommerceAuth;

// Initialize auth middleware with server configuration
initAuth({
  wordpressUrl: WORDPRESS_URL,
  addSecretToken: addSecretToken,
  getWooCommerceAuth: getWooCommerceAuth,
});

// Health check endpoint (must be before other routes to avoid conflicts)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    wordpress_url: WORDPRESS_URL,
    react_app_url: REACT_APP_URL,
  });
});

// Product Routes - Professional structure
// Public endpoint: GET /api/product/:productCode (no auth required)
// Admin endpoints: /api/admin/products/* (auth handled in routes)
app.use('/api', productRoutes);

// Debug: Log all registered routes (development only)
if (process.env.NODE_ENV !== 'production') {
  console.log('\n=== Registered Product Routes ===');
  productRoutes.stack.forEach((r) => {
    if (r.route) {
      const methods = Object.keys(r.route.methods).join(', ').toUpperCase();
      console.log(`${methods} /api${r.route.path}`);
    }
  });
  console.log('================================\n');
}

// Link Routes - Professional structure (admin only - auth handled in routes)
app.use('/api', linkRoutes);

// Order Routes - Professional structure
// Public endpoint: POST /api/orders (for design tool submissions)
// Admin endpoints: /api/admin/orders/* (auth handled in routes)
app.use('/api', orderRoutes);

// Design Routes - Professional structure
// Public endpoints: POST /api/designs/export, GET /api/designs/order/:orderId
app.use('/api', designRoutes);

/**
 * Get product configuration (Legacy endpoint - kept for backward compatibility)
 * GET /api/products/:id/config
 */
app.get('/api/products/:id/config', async (req, res) => {
  try {
    const productId = req.params.id;
    // Try local storage first
    let products = [];
    if (existsSync(PRODUCTS_DB)) {
      try {
        products = await fs.readJson(PRODUCTS_DB);
        const product = products.find(p => p.id === productId || p.productCode === productId);
        if (product && product.settings) {
          // Return same format as /api/product/:productCode
          return res.redirect(`/api/product/${product.productCode || productId}`);
        }
      } catch (e) {
        // Continue to WordPress fallback
      }
    }
    
    // Fallback to WordPress if not found locally
    const response = await axios.get(
      `${WORDPRESS_URL}/wp-json/design-tool/v1/products/${productId}/config`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers.authorization && { Authorization: req.headers.authorization }),
          ...(req.headers['x-wp-nonce'] && { 'X-WP-Nonce': req.headers['x-wp-nonce'] }),
        },
        withCredentials: true,
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Product config error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to get product configuration',
    });
  }
});

/**
 * Get user designs
 * GET /api/designs
 */
app.get('/api/designs', async (req, res) => {
  try {
    const response = await axios.get(
      addSecretToken(`${WORDPRESS_URL}/wp-json/design-tool/v1/designs`),
      {
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers.authorization && { Authorization: req.headers.authorization }),
          ...(req.headers['x-wp-nonce'] && { 'X-WP-Nonce': req.headers['x-wp-nonce'] }),
        },
        withCredentials: true,
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Get designs error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to get designs',
    });
  }
});

/**
 * Save design
 * POST /api/designs
 */
app.post('/api/designs', async (req, res) => {
  try {
    const response = await axios.post(
      addSecretToken(`${WORDPRESS_URL}/wp-json/design-tool/v1/designs`),
      req.body,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers.authorization && { Authorization: req.headers.authorization }),
          ...(req.headers['x-wp-nonce'] && { 'X-WP-Nonce': req.headers['x-wp-nonce'] }),
        },
        withCredentials: true,
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Save design error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to save design',
    });
  }
});

/**
 * Get specific design
 * GET /api/designs/:id
 */
app.get('/api/designs/:id', async (req, res) => {
  try {
    const designId = req.params.id;
    const response = await axios.get(
      addSecretToken(`${WORDPRESS_URL}/wp-json/design-tool/v1/designs/${designId}`),
      {
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers.authorization && { Authorization: req.headers.authorization }),
          ...(req.headers['x-wp-nonce'] && { 'X-WP-Nonce': req.headers['x-wp-nonce'] }),
        },
        withCredentials: true,
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Get design error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to get design',
    });
  }
});

/**
 * Update design
 * PUT /api/designs/:id
 */
app.put('/api/designs/:id', async (req, res) => {
  try {
    const designId = req.params.id;
    const response = await axios.put(
      addSecretToken(`${WORDPRESS_URL}/wp-json/design-tool/v1/designs/${designId}`),
      req.body,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers.authorization && { Authorization: req.headers.authorization }),
          ...(req.headers['x-wp-nonce'] && { 'X-WP-Nonce': req.headers['x-wp-nonce'] }),
        },
        withCredentials: true,
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Update design error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to update design',
    });
  }
});

/**
 * Delete design
 * DELETE /api/designs/:id
 */
app.delete('/api/designs/:id', async (req, res) => {
  try {
    const designId = req.params.id;
    const response = await axios.delete(
      addSecretToken(`${WORDPRESS_URL}/wp-json/design-tool/v1/designs/${designId}`),
      {
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers.authorization && { Authorization: req.headers.authorization }),
          ...(req.headers['x-wp-nonce'] && { 'X-WP-Nonce': req.headers['x-wp-nonce'] }),
        },
        withCredentials: true,
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Delete design error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to delete design',
    });
  }
});

/**
 * Add to cart
 * POST /api/cart/add
 */
app.post('/api/cart/add', async (req, res) => {
  try {
    const response = await axios.post(
      addSecretToken(`${WORDPRESS_URL}/wp-json/design-tool/v1/cart/add`),
      req.body,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers.authorization && { Authorization: req.headers.authorization }),
          ...(req.headers['x-wp-nonce'] && { 'X-WP-Nonce': req.headers['x-wp-nonce'] }),
        },
        withCredentials: true,
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Add to cart error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to add to cart',
    });
  }
});

/**
 * Get cart item design
 * GET /api/cart/design/:cartItemKey
 */
app.get('/api/cart/design/:cartItemKey', async (req, res) => {
  try {
    const cartItemKey = req.params.cartItemKey;
    const designId = req.query.design_id;
    let url = `${WORDPRESS_URL}/wp-json/design-tool/v1/cart/design/${cartItemKey}`;
    if (designId) {
      url += `?design_id=${encodeURIComponent(designId)}`;
    }
    
    const response = await axios.get(addSecretToken(url), {
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.authorization && { Authorization: req.headers.authorization }),
        ...(req.headers['x-wp-nonce'] && { 'X-WP-Nonce': req.headers['x-wp-nonce'] }),
      },
      withCredentials: true,
    });
    res.json(response.data);
  } catch (error) {
    console.error('Get cart design error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to get cart design',
    });
  }
});

/**
 * Upload image
 * POST /api/images/upload
 */
app.post('/api/images/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    // Forward multipart/form-data to WordPress
    const formData = new FormData();
    formData.append('image', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });
    
    const response = await axios.post(
      addSecretToken(`${WORDPRESS_URL}/wp-json/design-tool/v1/images/upload`),
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          ...(req.headers.authorization && { Authorization: req.headers.authorization }),
          ...(req.headers['x-wp-nonce'] && { 'X-WP-Nonce': req.headers['x-wp-nonce'] }),
        },
        withCredentials: true,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Upload image error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to upload image',
    });
  }
});

/**
 * Delete image
 * DELETE /api/images/:id
 */
app.delete('/api/images/:id', async (req, res) => {
  try {
    const imageId = req.params.id;
    const response = await axios.delete(
      addSecretToken(`${WORDPRESS_URL}/wp-json/design-tool/v1/images/${imageId}`),
      {
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers.authorization && { Authorization: req.headers.authorization }),
          ...(req.headers['x-wp-nonce'] && { 'X-WP-Nonce': req.headers['x-wp-nonce'] }),
        },
        withCredentials: true,
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Delete image error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to delete image',
    });
  }
});

/**
 * JWT Authentication - Login
 * POST /api/auth/login
 * Tries JWT first, falls back to WordPress cookie-based auth
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        error: 'Username and password are required',
      });
    }
    
    console.log('Login attempt for user:', username);
    console.log('WordPress URL:', WORDPRESS_URL);
    
    // Option 1: Simple local admin login (for development/standalone use)
    // Check for local admin credentials in environment or use defaults
    const LOCAL_ADMIN_USER = process.env.LOCAL_ADMIN_USER || 'admin';
    const LOCAL_ADMIN_PASS = process.env.LOCAL_ADMIN_PASS || 'admin123';
    
    if (username === LOCAL_ADMIN_USER && password === LOCAL_ADMIN_PASS) {
      console.log('Local admin login successful');
      return res.json({
        success: true,
        token: 'local-admin-token',
        user_id: 1,
        user_display_name: 'Administrator',
        user_email: 'admin@localhost',
        message: 'Login successful (local admin)',
        auth_method: 'local_admin'
      });
    }
    
    // Option 2: If WooCommerce API keys are configured, we can accept login without WordPress validation
    // (since backend uses API keys for admin operations)
    const wooCommerceAuth = getWooCommerceAuth();
    if (wooCommerceAuth) {
      console.log('WooCommerce API keys configured - accepting login with API key authentication');
      // Return success response - backend will use API keys for all operations
      return res.json({
        success: true,
        token: 'woocommerce-api-key', // Special token indicating API key auth
        user_id: 1,
        user_display_name: username,
        message: 'Login successful (using WooCommerce API keys)',
        auth_method: 'woocommerce_api_key'
      });
    }

    // Try JWT authentication first
    try {
        // JWT endpoints might not accept query parameters, try without secret token first
        let jwtUrl = `${WORDPRESS_URL}/wp-json/jwt-auth/v1/token`;
        let jwtResponse;
        
        try {
          // First try without secret token
          jwtResponse = await axios.post(
            jwtUrl,
            { username, password },
            {
              headers: {
                'Content-Type': 'application/json',
              },
              timeout: 5000,
            }
          );
        } catch (jwtError) {
          // If that fails with 404 or 403, try with secret token
          if (jwtError.response?.status === 404 || jwtError.response?.status === 403) {
            console.log('JWT login without token failed, trying with secret token...');
            jwtUrl = addSecretToken(jwtUrl);
            jwtResponse = await axios.post(
              jwtUrl,
              { username, password },
              {
                headers: {
                  'Content-Type': 'application/json',
                },
                timeout: 5000,
              }
            );
          } else {
            throw jwtError;
          }
        }
      
      if (jwtResponse.data && jwtResponse.data.token) {
        return res.json(jwtResponse.data);
      }
    } catch (jwtError) {
      console.log('JWT login failed, trying WordPress cookie auth:', jwtError.message);
      // Fall through to WordPress cookie auth
    }

    // Fallback: Try WordPress REST API login (cookie-based)
    // First check if WordPress is accessible
    try {
      const wpCheck = await axios.get(addSecretToken(`${WORDPRESS_URL}/wp-json/`), {
        timeout: 3000,
      });
      
      if (wpCheck.status === 200) {
        // WordPress is accessible, try the login endpoint
        try {
            const wpResponse = await axios.post(
              addSecretToken(`${WORDPRESS_URL}/wp-json/design-tool/v1/auth/login`),
              { username, password },
              {
                headers: {
                  'Content-Type': 'application/json',
                },
                timeout: 5000,
                withCredentials: true,
              }
            );
          
          if (wpResponse.data && wpResponse.data.success) {
            const responseData = {
              token: wpResponse.data.nonce || 'cookie-auth',
              user_id: wpResponse.data.user_id,
              user_display_name: wpResponse.data.user_display_name,
              user_email: wpResponse.data.user_email,
            };
            // Store user info in response for cookie-auth tokens
            if (responseData.token === 'cookie-auth') {
              responseData.cookie_auth = true;
              responseData.user_info = {
                id: responseData.user_id,
                display_name: responseData.user_display_name,
                email: responseData.user_email,
              };
            }
            return res.json(responseData);
          }
        } catch (wpError) {
          console.error('WordPress cookie auth failed:', wpError.response?.status, wpError.response?.data || wpError.message);
          console.error('Full error:', wpError);
          
          // If the endpoint doesn't exist (404), return helpful error
          if (wpError.response?.status === 404) {
            return res.status(401).json({
              error: 'WordPress authentication endpoint not found. Please ensure the Design Tool plugin is activated.',
              suggestion: 'Activate the WooCommerce Design Tool plugin in WordPress.',
              wordpress_url: WORDPRESS_URL,
            });
          }
          
          // For other errors, return the error details
          return res.status(wpError.response?.status || 500).json({
            error: 'WordPress authentication failed',
            message: wpError.response?.data?.message || wpError.message,
            wordpress_url: WORDPRESS_URL,
          });
        }
      }
    } catch (wpCheckError) {
      console.error('WordPress connection check failed:', wpCheckError.message);
      console.error('Error details:', wpCheckError.response?.status, wpCheckError.response?.data);
      return res.status(500).json({
        error: 'Cannot connect to WordPress',
        message: `WordPress at ${WORDPRESS_URL} is not accessible.`,
        suggestion: 'Please verify WordPress is running and the WORDPRESS_URL in .env is correct.',
        details: wpCheckError.message,
      });
    }

    // If both fail, return error
    return res.status(401).json({
      error: 'Invalid credentials or WordPress connection failed. Please check your username, password, and WordPress URL.',
      details: `WordPress URL: ${WORDPRESS_URL}`,
    });
  } catch (error) {
    console.error('Login error:', error.message);
    console.error('Error stack:', error.stack);
    return res.status(500).json({
      error: 'Login failed',
      message: error.message,
      details: `Cannot connect to WordPress at ${WORDPRESS_URL}. Please verify WordPress is running and the URL is correct.`,
      wordpress_url: WORDPRESS_URL,
    });
  }
});

/**
 * JWT Authentication - Validate
 * GET /api/auth/validate
 * Handles both JWT tokens and cookie-based auth (nonce)
 */
app.get('/api/auth/validate', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    // Check for local admin token
    if (authHeader && authHeader.startsWith('Bearer ') && authHeader.substring(7) === 'local-admin-token') {
      console.log('Auth validate: Local admin token, returning valid');
      return res.json({ 
        valid: true, 
        user_id: 1,
        user_display_name: 'Administrator',
        auth_method: 'local_admin'
      });
    }
    
    // If WooCommerce API keys are configured, authentication is handled server-side
    // Return valid to allow frontend to proceed
    const wooCommerceAuth = getWooCommerceAuth();
    if (wooCommerceAuth) {
      console.log('Auth validate: WooCommerce API keys configured, returning valid');
      return res.json({ 
        valid: true, 
        user_id: 1,
        user_display_name: 'Administrator',
        auth_method: 'woocommerce_api_key'
      });
    }
    
    // If no auth header, check cookie-based auth via WordPress
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Try WordPress cookie-based validation
      try {
        const wpResponse = await axios.get(
          addSecretToken(`${WORDPRESS_URL}/wp-json/design-tool/v1/auth/validate`),
          {
            headers: {
              'Content-Type': 'application/json',
            },
            withCredentials: true,
          }
        );
        
        if (wpResponse.data && wpResponse.data.valid) {
          return res.json(wpResponse.data);
        }
      } catch (wpError) {
        // WordPress validation failed, continue to JWT check
      }
      
      return res.json({ valid: false });
    }
    
    // Try JWT validation
    const token = authHeader.substring(7);
    
    // If token is 'cookie-auth' or nonce, use WordPress validation
    if (token === 'cookie-auth' || token.length < 50) {
      try {
        const wpResponse = await axios.get(
          addSecretToken(`${WORDPRESS_URL}/wp-json/design-tool/v1/auth/validate`),
          {
            headers: {
              'Content-Type': 'application/json',
            },
            withCredentials: true,
          }
        );
        
        if (wpResponse.data && wpResponse.data.valid) {
          return res.json(wpResponse.data);
        }
      } catch (wpError) {
        // WordPress validation failed
      }
      
      return res.json({ valid: false });
    }
    
    // Try JWT validation
    try {
      const response = await axios.post(
        `${WORDPRESS_URL}/wp-json/jwt-auth/v1/token/validate`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      res.json(response.data);
    } catch (jwtError) {
      // JWT validation failed
      console.log('JWT validation failed, trying WordPress cookie auth');
      return res.json({ valid: false });
    }
  } catch (error) {
    console.error('Validate token error:', error.message);
    res.json({ valid: false });
  }
});

// Admin Routes - require authentication
const checkAdminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    // Forward cookies from browser request to WordPress
    const cookieHeader = req.headers.cookie || '';
    
    console.log('checkAdminAuth - Auth header:', authHeader ? 'Present' : 'Missing');
    console.log('checkAdminAuth - Cookie header:', cookieHeader ? 'Present' : 'Missing');
    console.log('checkAdminAuth - Token:', authHeader ? authHeader.substring(0, 20) + '...' : 'None');
    
    // Check for local admin token first
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (token === 'local-admin-token') {
        console.log('checkAdminAuth: Local admin token accepted');
        req.user = { id: 1, role: 'administrator' };
        return next();
      }
    }
    
    // If WooCommerce API keys are configured, use them for admin requests
    const wooCommerceAuth = getWooCommerceAuth();
    if (wooCommerceAuth) {
      console.log('Using WooCommerce API key authentication (bypassing JWT validation)');
      req.wooCommerceAuth = wooCommerceAuth;
      req.user = { id: 1, role: 'administrator' }; // Trust API key as admin
      return next();
    }
    
    // If no auth header, try cookie-based auth
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Try WordPress cookie-based validation
      try {
        const wpResponse = await axios.get(
          addSecretToken(`${WORDPRESS_URL}/wp-json/design-tool/v1/auth/validate`),
          {
            headers: {
              'Content-Type': 'application/json',
              ...(cookieHeader && { 'Cookie': cookieHeader }),
            },
            withCredentials: true,
          }
        );
        
        if (wpResponse.data && wpResponse.data.valid && wpResponse.data.user_id) {
          // Check if user is admin (you can get user details from WordPress)
          req.user = { id: wpResponse.data.user_id };
          return next();
        }
      } catch (wpError) {
        console.log('Cookie auth failed (no header):', wpError.response?.status, wpError.response?.data || wpError.message);
      }
      
      return res.status(401).json({ error: 'Unauthorized - Please login' });
    }
    
    // Validate JWT token or cookie-based token
    const token = authHeader.substring(7);
    
    // If token is 'cookie-auth', trust it (it was issued during successful login)
    // We can't re-validate with WordPress because cookies are domain-specific
    if (token === 'cookie-auth') {
      // Trust cookie-auth token - it was issued after successful WordPress login
      // For cookie-auth, we trust the login was successful
      // In a real app, you might want to store session info in Redis/database
      req.user = { id: 1, role: 'administrator' }; // Trust as admin since login succeeded
      console.log('Accepted cookie-auth token (trusted from successful login)');
      return next();
    }
    
    // If token is very short (nonce), try WordPress validation
    if (token.length < 50 && token !== 'cookie-auth') {
      try {
        const wpResponse = await axios.get(
          addSecretToken(`${WORDPRESS_URL}/wp-json/design-tool/v1/auth/validate`),
          {
            headers: {
              'Content-Type': 'application/json',
              ...(cookieHeader && { 'Cookie': cookieHeader }),
            },
            withCredentials: true,
          }
        );
        
        if (wpResponse.data && wpResponse.data.valid && wpResponse.data.user_id) {
          req.user = { id: wpResponse.data.user_id };
          return next();
        }
      } catch (wpError) {
        console.log('Nonce validation failed:', wpError.response?.status, wpError.response?.data || wpError.message);
      }
      
      return res.status(401).json({ error: 'Invalid authentication' });
    }
    
    // Try JWT validation
    try {
      console.log('Attempting JWT validation with WordPress...');
      // JWT endpoints might not accept query parameters, try without secret token first
      let validateUrl = `${WORDPRESS_URL}/wp-json/jwt-auth/v1/token/validate`;
      let validateResponse;
      
      try {
        // First try without secret token (JWT endpoints typically don't need it)
        validateResponse = await axios.post(
          validateUrl,
          {},
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
      } catch (firstError) {
        // If that fails with 404 or 403, try with secret token
        if (firstError.response?.status === 404 || firstError.response?.status === 403) {
          console.log('JWT validation without token failed, trying with secret token...');
          validateUrl = addSecretToken(validateUrl);
          validateResponse = await axios.post(
            validateUrl,
            {},
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );
        } else {
          throw firstError;
        }
      }
      
      console.log('JWT validation response status:', validateResponse.status);
      console.log('JWT validation response data:', JSON.stringify(validateResponse.data).substring(0, 200));
      
      if (validateResponse.data && validateResponse.data.data && validateResponse.data.data.user) {
        const user = validateResponse.data.data.user;
        req.user = user;
        console.log('JWT validation successful for user:', user.id);
        return next();
      }
      
      // Also check alternative JWT response format
      if (validateResponse.data && validateResponse.data.data && validateResponse.data.data.status === 200) {
        const user = validateResponse.data.data;
        req.user = { id: user.id || 1 };
        console.log('JWT validation successful (alternative format)');
        return next();
      }
    } catch (jwtError) {
      console.log('JWT validation failed:', jwtError.response?.status, jwtError.response?.data || jwtError.message);
      console.log('JWT error details:', {
        status: jwtError.response?.status,
        statusText: jwtError.response?.statusText,
        data: jwtError.response?.data,
        message: jwtError.message
      });
      
      // JWT validation failed, try cookie auth as fallback
      try {
        console.log('Trying cookie fallback...');
        const wpResponse = await axios.get(
          addSecretToken(`${WORDPRESS_URL}/wp-json/design-tool/v1/auth/validate`),
          {
            headers: {
              'Content-Type': 'application/json',
              ...(cookieHeader && { 'Cookie': cookieHeader }),
            },
            withCredentials: true,
          }
        );
        
        if (wpResponse.data && wpResponse.data.valid && wpResponse.data.user_id) {
          req.user = { id: wpResponse.data.user_id };
          console.log('Cookie fallback successful');
          return next();
        }
      } catch (wpError) {
        console.log('Cookie fallback also failed:', wpError.response?.status, wpError.response?.data || wpError.message);
      }
    }
    
    console.log('All authentication methods failed');
    res.status(401).json({ error: 'Invalid token or authentication failed' });
  } catch (error) {
    console.error('Admin auth error:', error.message);
    res.status(401).json({ error: 'Authentication error' });
  }
};

// Admin - Get system stats
app.get('/api/admin/stats', checkAdminAuth, async (req, res) => {
  try {
    // Get products count from local storage (design tool products)
    let totalProducts = 0;
    try {
      if (existsSync(PRODUCTS_DB)) {
        const products = await fs.readJson(PRODUCTS_DB);
        totalProducts = products.length;
      }
    } catch (e) {
      console.error('Failed to read products for stats:', e);
    }
    
    // Get orders count from local storage
    let totalOrders = 0;
    try {
      if (existsSync(ORDERS_DIR)) {
        const orderFiles = await fs.readdir(ORDERS_DIR);
        totalOrders = orderFiles.filter(f => f.endsWith('.json')).length;
      }
    } catch (e) {
      console.error('Failed to read orders for stats:', e);
    }
    
    // Get links count
    let totalLinks = 0;
    try {
      if (existsSync(LINKS_DB)) {
        const links = await fs.readJson(LINKS_DB);
        totalLinks = links.length;
      }
    } catch (e) {
      console.error('Failed to read links for stats:', e);
    }
    
    // Test WordPress API connection (optional - don't fail if it doesn't work)
    let apiStatus = 'disconnected';
    try {
      const apiTest = await axios.get(addSecretToken(`${WORDPRESS_URL}/wp-json/design-tool/v1/`), {
        timeout: 3000,
      });
      apiStatus = 'connected';
    } catch (e) {
      // WordPress not available - that's okay for standalone mode
      apiStatus = 'disconnected';
    }
    
    res.json({
      totalProducts: totalProducts,
      totalOrders: totalOrders,
      totalLinks: totalLinks,
      activeDesigns: 0, // Can be implemented later
      totalUsers: 0, // Can be implemented later
      apiStatus,
      wordpressUrl: WORDPRESS_URL,
      backendStatus: 'running',
      lastSync: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Stats error:', error.message);
    // Return basic stats even if there's an error
    res.json({
      totalProducts: 0,
      totalOrders: 0,
      totalLinks: 0,
      activeDesigns: 0,
      totalUsers: 0,
      apiStatus: 'disconnected',
      wordpressUrl: WORDPRESS_URL,
      backendStatus: 'running',
      lastSync: new Date().toISOString(),
    });
  }
});

// Admin - Get configuration
app.get('/api/admin/config', checkAdminAuth, async (req, res) => {
  res.json({
    config: {
      wordpressUrl: WORDPRESS_URL,
      apiEndpoint: '/wp-json/design-tool/v1',
      jwtEnabled: true,
      jwtSecret: process.env.JWT_SECRET_KEY || '',
    },
  });
});

// Admin - Save configuration
app.post('/api/admin/config', checkAdminAuth, async (req, res) => {
  // In production, save to .env or config file
  // For now, just return success
  res.json({ success: true, message: 'Configuration saved' });
});

// Admin - Test WordPress connection
app.post('/api/admin/test-connection', checkAdminAuth, async (req, res) => {
  try {
    const { wordpressUrl } = req.body;
    const testUrl = wordpressUrl || WORDPRESS_URL;
    
    const results = {};
    
    // Test 1: WordPress REST API
    try {
      await axios.get(addSecretToken(`${testUrl}/wp-json/`));
      results['WordPress REST API'] = 'OK';
    } catch (e) {
      results['WordPress REST API'] = 'FAILED';
    }
    
    // Test 2: Design Tool API
    try {
      await axios.get(addSecretToken(`${testUrl}/wp-json/design-tool/v1/`));
      results['Design Tool API'] = 'OK';
    } catch (e) {
      results['Design Tool API'] = 'FAILED';
    }
    
    // Test 3: WooCommerce API
    try {
      await axios.get(addSecretToken(`${testUrl}/wp-json/wc/v3/`), {
        headers: {
          'Authorization': req.headers.authorization,
        },
      });
      results['WooCommerce API'] = 'OK';
    } catch (e) {
      results['WooCommerce API'] = 'FAILED';
    }
    
    const allOk = Object.values(results).every(v => v === 'OK');
    
    res.json({
      success: allOk,
      results,
    });
  } catch (error) {
    res.status(500).json({ error: 'Connection test failed' });
  }
});

// Product routes are now handled by productRoutes.js (imported above)

// Admin - Get system settings
app.get('/api/admin/system-settings', checkAdminAuth, async (req, res) => {
  res.json({
    settings: {
      backendPort: process.env.BACKEND_PORT || 5000,
      reactPort: 3000,
      enableCors: true,
      logLevel: 'info',
      maxUploadSize: 10,
      sessionTimeout: 3600,
    },
  });
});

// Admin - Save system settings
app.post('/api/admin/system-settings', checkAdminAuth, async (req, res) => {
  // In production, save to config file
  res.json({ success: true, message: 'Settings saved' });
});

// Admin - Get users
app.get('/api/admin/users', checkAdminAuth, async (req, res) => {
  try {
    // WordPress REST API doesn't accept WooCommerce API keys
    // We need to use Application Password or JWT token for WordPress REST API
    // For now, if WooCommerce keys are configured, we'll return a helpful message
    // or try to get users via a different method
    
    console.log('Fetching users from WordPress REST API');
    console.log('WordPress URL:', WORDPRESS_URL);
    
    // Try to get users - WordPress REST API typically needs Application Password
    // WooCommerce API keys won't work for wp/v2/users endpoint
    try {
      // First, try without auth (might work if WordPress allows it)
      let response;
      try {
        response = await axios.get(
          addSecretToken(`${WORDPRESS_URL}/wp-json/wp/v2/users?per_page=100&context=edit`),
          {
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );
      } catch (noAuthError) {
        // If that fails, try with the auth header (might be JWT or Application Password)
        const authHeader = req.headers.authorization;
        if (authHeader && !authHeader.includes('Basic')) {
          // Only try if it's not Basic auth (WooCommerce keys)
          console.log('Trying with provided auth header (non-Basic)');
          response = await axios.get(
            addSecretToken(`${WORDPRESS_URL}/wp-json/wp/v2/users?per_page=100&context=edit`),
            {
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
              },
              timeout: 10000,
            }
          );
        } else {
          throw noAuthError;
        }
      }
      
      const users = (response.data || []).map(user => ({
        id: user.id,
        username: user.name || user.slug || `user_${user.id}`,
        email: user.email || '',
        role: user.roles?.[0] || 'subscriber',
        designCount: 0, // You can implement this
        status: 'active',
      }));
      
      res.json({ users });
    } catch (wpError) {
      // WordPress REST API failed
      console.error('WordPress users API error:', wpError.response?.status, wpError.response?.data || wpError.message);
      
      // Return helpful error message
      const errorStatus = wpError.response?.status;
      const errorMessage = wpError.response?.data?.message || wpError.message;
      
      if (errorStatus === 401 || errorStatus === 403) {
        // Authentication issue
        res.status(200).json({ 
          users: [],
          error: 'WordPress REST API requires Application Password authentication. WooCommerce API keys cannot be used for user management.',
          suggestion: 'Create an Application Password in WordPress (Users > Your Profile > Application Passwords) and use it for user management.',
          details: errorMessage
        });
      } else {
        // Other error
        res.status(200).json({ 
          users: [],
          error: 'Unable to fetch users from WordPress',
          details: errorMessage,
          status: errorStatus
        });
      }
    }
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      error: 'Failed to get users', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Admin - Create admin user
app.post('/api/admin/users', checkAdminAuth, async (req, res) => {
  try {
    const { username, email, password, firstName, lastName } = req.body;
    const authHeader = req.wooCommerceAuth || req.headers.authorization;
    
    // Create user via WordPress REST API
    const response = await axios.post(
      addSecretToken(`${WORDPRESS_URL}/wp-json/wp/v2/users`),
      {
        username,
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        roles: ['administrator'],
      },
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      }
    );
    
    res.json({ success: true, user: response.data });
  } catch (error) {
    console.error('Failed to create user:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create user', details: error.message });
  }
});

// Orders - Get all orders with design data
app.get('/api/admin/orders', checkAdminAuth, async (req, res) => {
  try {
    const authHeader = req.wooCommerceAuth || req.headers.authorization;
    const response = await axios.get(
      addSecretToken(`${WORDPRESS_URL}/wp-json/wc/v3/orders?per_page=100&status=any`),
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      }
    );
    
    // Filter orders that have design data
    const ordersWithDesigns = response.data.map(order => {
      const itemsWithDesign = order.line_items.filter(item => 
        item.meta_data.some(meta => meta.key.startsWith('_design_'))
      );
      return {
        ...order,
        has_design: itemsWithDesign.length > 0,
        design_items_count: itemsWithDesign.length,
      };
    }).filter(order => order.has_design);
    
    res.json({ orders: ordersWithDesigns });
  } catch (error) {
    console.error('Failed to get orders:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to get orders', details: error.message });
  }
});

// Orders - Get order details with design data
app.get('/api/admin/orders/:id', checkAdminAuth, async (req, res) => {
  try {
    const orderId = req.params.id;
    const authHeader = req.wooCommerceAuth || req.headers.authorization;
    
    const response = await axios.get(
      addSecretToken(`${WORDPRESS_URL}/wp-json/wc/v3/orders/${orderId}`),
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      }
    );
    
    const order = response.data;
    
    // Extract design data from order items
    const designItems = order.line_items.map(item => {
      const designMeta = {};
      item.meta_data.forEach(meta => {
        if (meta.key.startsWith('_design_')) {
          designMeta[meta.key] = meta.value;
        }
      });
      
      return {
        item_id: item.id,
        product_id: item.product_id,
        product_name: item.name,
        quantity: item.quantity,
        design_id: designMeta._design_id,
        design_name: designMeta._design_name,
        design_thumbnail: designMeta._design_thumbnail,
        design_data: designMeta._design_data,
      };
    }).filter(item => item.design_id);
    
    res.json({ order, design_items: designItems });
  } catch (error) {
    console.error('Failed to get order:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to get order', details: error.message });
  }
});

// Orders - Download design ZIP for order
app.get('/api/admin/orders/:id/download', checkAdminAuth, async (req, res) => {
  try {
    const orderId = req.params.id;
    const authHeader = req.wooCommerceAuth || req.headers.authorization;
    
    // Get order details
    const orderResponse = await axios.get(
      addSecretToken(`${WORDPRESS_URL}/wp-json/wc/v3/orders/${orderId}`),
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      }
    );
    
    const order = orderResponse.data;
    const orderDir = join(ORDERS_DIR, orderId.toString());
    
    // Ensure order directory exists
    if (!existsSync(orderDir)) {
      mkdirSync(orderDir, { recursive: true });
    }
    
    // Create ZIP file
    const zipPath = join(orderDir, `order-${orderId}-designs.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    output.on('close', () => {
      console.log(`ZIP file created: ${zipPath} (${archive.pointer()} bytes)`);
    });
    
    archive.on('error', (err) => {
      throw err;
    });
    
    archive.pipe(output);
    
    // Add design files from order items
    for (const item of order.line_items) {
      const designId = item.meta_data.find(m => m.key === '_design_id')?.value;
      const designName = item.meta_data.find(m => m.key === '_design_name')?.value || `design-${item.id}`;
      
      if (designId) {
        // Try to find design files in order directory
        const safeName = designName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const pngPath = join(orderDir, `${safeName}-300dpi.png`);
        
        if (existsSync(pngPath)) {
          archive.file(pngPath, { name: `${safeName}-300dpi.png` });
        }
        
        // Add design data JSON if available
        const designData = item.meta_data.find(m => m.key === '_design_data')?.value;
        if (designData) {
          const designDataPath = join(orderDir, `${safeName}-data.json`);
          fs.writeFileSync(designDataPath, designData);
          archive.file(designDataPath, { name: `${safeName}-data.json` });
        }
      }
    }
    
    await archive.finalize();
    
    // Wait for file to be written
    await new Promise((resolve) => output.on('close', resolve));
    
    // Send ZIP file
    res.download(zipPath, `order-${orderId}-designs.zip`, (err) => {
      if (err) {
        console.error('Error sending ZIP file:', err);
      }
    });
  } catch (error) {
    console.error('Failed to create ZIP:', error.message);
    res.status(500).json({ error: 'Failed to create ZIP file', details: error.message });
  }
});

// Images - Upload image (stores permanently)
app.post('/api/images/upload', multer({ 
  dest: IMAGES_DIR,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
}).single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Generate unique filename
    const timestamp = Date.now();
    const originalName = req.file.originalname;
    const ext = originalName.split('.').pop();
    const filename = `${timestamp}-${Math.random().toString(36).substring(7)}.${ext}`;
    const filepath = join(IMAGES_DIR, filename);
    
    // Move file to permanent location
    await fs.move(req.file.path, filepath);
    
    // Return URL (relative to backend)
    const imageUrl = `/api/images/${filename}`;
    
    res.json({ 
      success: true, 
      url: imageUrl,
      filename: filename,
      path: filepath
    });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ error: 'Failed to upload image', details: error.message });
  }
});

// Images - Serve uploaded images
app.get('/api/images/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = join(IMAGES_DIR, filename);
    
    if (!existsSync(filepath)) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    res.sendFile(filepath);
  } catch (error) {
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// Designs - Get customer designs (only their own)
app.get('/api/designs', async (req, res) => {
  try {
    const userId = req.query.user_id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }
    
    // Get designs from WordPress REST API (filtered by user)
    const response = await axios.get(
      addSecretToken(`${WORDPRESS_URL}/wp-json/design-tool/v1/designs?user_id=${userId}`),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    res.json({ designs: response.data });
  } catch (error) {
    console.error('Failed to get designs:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to get designs', details: error.message });
  }
});

// Customer Designs - Save customer design to uploads/customer-designs folder
// POST /api/customer-designs/save
app.post('/api/customer-designs/save', async (req, res) => {
  try {
    const { userId, designId, designData, previewImage, orderId, productId } = req.body;
    
    if (!userId || !designId || !designData) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        required: ['userId', 'designId', 'designData'] 
      });
    }
    
    // Create customer-specific directory: uploads/customer-designs/{userId}/{designId}/
    const customerDir = join(CUSTOMER_DESIGNS_DIR, userId.toString());
    const designDir = join(customerDir, designId);
    
    // Ensure directories exist
    if (!existsSync(designDir)) {
      mkdirSync(designDir, { recursive: true });
      console.log(`Created customer design directory: ${designDir}`);
    }
    
    // Save design JSON
    const designJsonPath = join(designDir, 'design.json');
    await fs.writeJson(designJsonPath, designData, { spaces: 2 });
    
    // Save preview image if provided (base64 or URL)
    let previewPath = null;
    if (previewImage) {
      previewPath = join(designDir, 'preview.png');
      if (previewImage.startsWith('data:image')) {
        // Base64 image
        const base64Data = previewImage.replace(/^data:image\/\w+;base64,/, '');
        await fs.writeFile(previewPath, base64Data, 'base64');
      } else if (previewImage.startsWith('http')) {
        // URL - download and save
        const imageResponse = await axios.get(previewImage, { responseType: 'arraybuffer' });
        await fs.writeFile(previewPath, Buffer.from(imageResponse.data));
      }
    }
    
    // Save metadata
    const metadata = {
      designId,
      userId: userId.toString(),
      orderId: orderId || null,
      productId: productId || null,
      savedAt: new Date().toISOString(),
      designJsonPath: designJsonPath,
      previewPath: previewPath,
      designUrl: `/api/customer-designs/${userId}/${designId}/design.json`,
      previewUrl: previewPath ? `/api/customer-designs/${userId}/${designId}/preview.png` : null,
    };
    
    const metadataPath = join(designDir, 'metadata.json');
    await fs.writeJson(metadataPath, metadata, { spaces: 2 });
    
    console.log(`Customer design saved: ${designDir}`);
    
    return res.json({
      success: true,
      message: 'Customer design saved successfully',
      design: metadata,
    });
  } catch (error) {
    console.error('Failed to save customer design:', error);
    res.status(500).json({ 
      error: 'Failed to save customer design', 
      details: error.message 
    });
  }
});

// Customer Designs - Get customer design by user ID and design ID
// GET /api/customer-designs/:userId/:designId
app.get('/api/customer-designs/:userId/:designId', async (req, res) => {
  try {
    const { userId, designId } = req.params;
    const designDir = join(CUSTOMER_DESIGNS_DIR, userId, designId);
    
    if (!existsSync(designDir)) {
      return res.status(404).json({ error: 'Design not found' });
    }
    
    // Read metadata
    const metadataPath = join(designDir, 'metadata.json');
    let metadata = {};
    if (existsSync(metadataPath)) {
      metadata = await fs.readJson(metadataPath);
    }
    
    // Read design JSON
    const designJsonPath = join(designDir, 'design.json');
    let designData = null;
    if (existsSync(designJsonPath)) {
      designData = await fs.readJson(designJsonPath);
    }
    
    res.json({
      success: true,
      design: {
        ...metadata,
        designData,
      },
    });
  } catch (error) {
    console.error('Failed to get customer design:', error);
    res.status(500).json({ 
      error: 'Failed to get customer design', 
      details: error.message 
    });
  }
});

// Customer Designs - List all designs for a customer
// GET /api/customer-designs/:userId
app.get('/api/customer-designs/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const customerDir = join(CUSTOMER_DESIGNS_DIR, userId);
    
    if (!existsSync(customerDir)) {
      return res.json({ success: true, designs: [] });
    }
    
    // List all design directories
    const designDirs = await fs.readdir(customerDir);
    const designs = [];
    
    for (const designId of designDirs) {
      const designDir = join(customerDir, designId);
      const stats = await fs.stat(designDir);
      
      if (stats.isDirectory()) {
        const metadataPath = join(designDir, 'metadata.json');
        let metadata = {};
        
        if (existsSync(metadataPath)) {
          try {
            metadata = await fs.readJson(metadataPath);
            designs.push({
              designId,
              userId,
              ...metadata,
            });
          } catch (e) {
            console.error(`Failed to read metadata for ${designId}:`, e);
          }
        } else {
          // Fallback: create basic metadata from directory
          designs.push({
            designId,
            userId,
            savedAt: stats.mtime.toISOString(),
            designUrl: `/api/customer-designs/${userId}/${designId}/design.json`,
          });
        }
      }
    }
    
    // Sort by savedAt (newest first)
    designs.sort((a, b) => {
      const dateA = new Date(a.savedAt || 0);
      const dateB = new Date(b.savedAt || 0);
      return dateB - dateA;
    });
    
    res.json({
      success: true,
      designs,
      count: designs.length,
    });
  } catch (error) {
    console.error('Failed to list customer designs:', error);
    res.status(500).json({ 
      error: 'Failed to list customer designs', 
      details: error.message 
    });
  }
});

// Customer Designs - Serve design JSON file
// GET /api/customer-designs/:userId/:designId/design.json
app.get('/api/customer-designs/:userId/:designId/design.json', (req, res) => {
  try {
    const { userId, designId } = req.params;
    const designJsonPath = join(CUSTOMER_DESIGNS_DIR, userId, designId, 'design.json');
    
    if (!existsSync(designJsonPath)) {
      return res.status(404).json({ error: 'Design JSON not found' });
    }
    
    res.sendFile(designJsonPath);
  } catch (error) {
    res.status(500).json({ error: 'Failed to serve design JSON' });
  }
});

// Customer Designs - Serve preview image
// GET /api/customer-designs/:userId/:designId/preview.png
app.get('/api/customer-designs/:userId/:designId/preview.png', (req, res) => {
  try {
    const { userId, designId } = req.params;
    const previewPath = join(CUSTOMER_DESIGNS_DIR, userId, designId, 'preview.png');
    
    if (!existsSync(previewPath)) {
      return res.status(404).json({ error: 'Preview image not found' });
    }
    
    res.sendFile(previewPath);
  } catch (error) {
    res.status(500).json({ error: 'Failed to serve preview image' });
  }
});

// Customer Designs - WordPress endpoint to fetch customer designs
// GET /api/wordpress/customer-designs/:userId
app.get('/api/wordpress/customer-designs/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const customerDir = join(CUSTOMER_DESIGNS_DIR, userId);
    
    if (!existsSync(customerDir)) {
      return res.json({ success: true, designs: [] });
    }
    
    // List all design directories
    const designDirs = await fs.readdir(customerDir);
    const designs = [];
    
    for (const designId of designDirs) {
      const designDir = join(customerDir, designId);
      const stats = await fs.stat(designDir);
      
      if (stats.isDirectory()) {
        const metadataPath = join(designDir, 'metadata.json');
        let metadata = {};
        
        if (existsSync(metadataPath)) {
          try {
            metadata = await fs.readJson(metadataPath);
            designs.push({
              design_id: designId,
              user_id: userId,
              order_id: metadata.orderId,
              product_id: metadata.productId,
              saved_at: metadata.savedAt,
              design_url: `http://localhost:${PORT}${metadata.designUrl}`,
              preview_url: metadata.previewUrl ? `http://localhost:${PORT}${metadata.previewUrl}` : null,
            });
          } catch (e) {
            console.error(`Failed to read metadata for ${designId}:`, e);
          }
        }
      }
    }
    
    // Sort by savedAt (newest first)
    designs.sort((a, b) => {
      const dateA = new Date(a.saved_at || 0);
      const dateB = new Date(b.saved_at || 0);
      return dateB - dateA;
    });
    
    res.json({
      success: true,
      designs,
      count: designs.length,
    });
  } catch (error) {
    console.error('Failed to get customer designs for WordPress:', error);
    res.status(500).json({ 
      error: 'Failed to get customer designs', 
      details: error.message 
    });
  }
});

// Admin - Get fonts
app.get('/api/admin/fonts', checkAdminAuth, async (req, res) => {
  try {
    // List font files from fonts directory
    const fontFiles = [];
    if (existsSync(FONTS_DIR)) {
      const files = await fs.readdir(FONTS_DIR);
      for (const file of files) {
        const filePath = join(FONTS_DIR, file);
        const stats = await fs.stat(filePath);
        if (stats.isFile() && /\.(ttf|otf|woff|woff2)$/i.test(file)) {
          // Try to read metadata if exists
          const metadataPath = join(FONTS_DIR, file.replace(/\.(ttf|otf|woff|woff2)$/i, '.json'));
          let metadata = {};
          if (existsSync(metadataPath)) {
            try {
              metadata = await fs.readJson(metadataPath);
            } catch (e) {
              // Ignore metadata read errors
            }
          }
          
          const fontId = metadata.id || file.replace(/\.(ttf|otf|woff|woff2)$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '-');
          const fontName = metadata.name || file.replace(/\.(ttf|otf|woff|woff2)$/i, '').replace(/[-_]/g, ' ');
          
          fontFiles.push({
            id: fontId,
            name: fontName,
            family: metadata.family || fontName,
            filename: file,
            url: `/api/admin/fonts/${file}`,
            size: stats.size,
            uploaded_at: stats.mtime,
            license: metadata.license || 'public',
            types: metadata.types || metadata.variants || 'regular',
            used: metadata.used || false,
          });
        }
      }
    }
    res.json({ fonts: fontFiles });
  } catch (error) {
    console.error('Failed to get fonts:', error);
    res.status(500).json({ error: 'Failed to get fonts', details: error.message });
  }
});

// Admin - Upload font
app.post('/api/admin/fonts/upload', checkAdminAuth, multer({ 
  dest: FONTS_DIR,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
}).single('fontFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No font file uploaded' });
    }
    
    const { name, family, license } = req.body;
    const originalName = req.file.originalname;
    const ext = originalName.split('.').pop();
    const fontId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const filename = `${fontId}.${ext}`;
    const filepath = join(FONTS_DIR, filename);
    
    // Move file to permanent location
    await fs.move(req.file.path, filepath);
    
    // Save metadata
    const metadataPath = join(FONTS_DIR, `${fontId}.json`);
    await fs.writeJson(metadataPath, {
      id: fontId,
      name: name,
      family: family || name,
      license: license || 'public',
      types: 'regular',
      used: false,
      uploaded_at: new Date().toISOString(),
    });
    
    res.json({ 
      success: true, 
      font: {
        id: fontId,
        name: name,
        family: family || name,
        filename: filename,
        url: `/api/admin/fonts/${filename}`,
        license: license || 'public',
        types: 'regular',
      }
    });
  } catch (error) {
    console.error('Font upload error:', error);
    res.status(500).json({ error: 'Failed to upload font', details: error.message });
  }
});

// Admin - Serve font file
app.get('/api/admin/fonts/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = join(FONTS_DIR, filename);
    
    if (!existsSync(filepath)) {
      return res.status(404).json({ error: 'Font not found' });
    }
    
    res.sendFile(filepath);
  } catch (error) {
    res.status(500).json({ error: 'Failed to serve font' });
  }
});

// Admin - Delete font
app.delete('/api/admin/fonts/:filename', checkAdminAuth, async (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = join(FONTS_DIR, filename);
    
    if (!existsSync(filepath)) {
      return res.status(404).json({ error: 'Font not found' });
    }
    
    await fs.remove(filepath);
    res.json({ success: true, message: 'Font deleted successfully' });
  } catch (error) {
    console.error('Failed to delete font:', error);
    res.status(500).json({ error: 'Failed to delete font', details: error.message });
  }
});

// Admin - Get clipart
app.get('/api/admin/clipart', checkAdminAuth, async (req, res) => {
  try {
    const clipartItems = [];
    if (existsSync(CLIPART_DIR)) {
      const files = await fs.readdir(CLIPART_DIR);
      for (const file of files) {
        const filePath = join(CLIPART_DIR, file);
        const stats = await fs.stat(filePath);
        if (stats.isFile() && /\.(png|svg|jpg|jpeg)$/i.test(file)) {
          // Try to read metadata if exists
          const metadataPath = join(CLIPART_DIR, file.replace(/\.(png|svg|jpg|jpeg)$/i, '.json'));
          let metadata = {};
          if (existsSync(metadataPath)) {
            try {
              metadata = await fs.readJson(metadataPath);
            } catch (e) {
              // Ignore metadata read errors
            }
          }
          
          clipartItems.push({
            id: file,
            name: metadata.name || file.replace(/\.(png|svg|jpg|jpeg)$/i, ''),
            category: metadata.category || 'Uncategorized',
            filename: file,
            url: `/api/admin/clipart/${file}`,
            size: stats.size,
            uploaded_at: stats.mtime,
          });
        }
      }
    }
    res.json({ clipart: clipartItems });
  } catch (error) {
    console.error('Failed to get clipart:', error);
    res.status(500).json({ error: 'Failed to get clipart', details: error.message });
  }
});

// Admin - Upload clipart
app.post('/api/admin/clipart/upload', checkAdminAuth, multer({ 
  dest: CLIPART_DIR,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
}).single('imageFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    
    const { name, category } = req.body;
    const originalName = req.file.originalname;
    const ext = originalName.split('.').pop();
    const timestamp = Date.now();
    const filename = `${timestamp}-${Math.random().toString(36).substring(7)}.${ext}`;
    const filepath = join(CLIPART_DIR, filename);
    
    // Move file to permanent location
    await fs.move(req.file.path, filepath);
    
    // Save metadata
    const metadataPath = join(CLIPART_DIR, filename.replace(/\.(png|svg|jpg|jpeg)$/i, '.json'));
    await fs.writeJson(metadataPath, {
      name: name || originalName,
      category: category || 'Uncategorized',
      uploaded_at: new Date().toISOString(),
    });
    
    res.json({ 
      success: true, 
      clipart: {
        id: filename,
        name: name || originalName,
        category: category || 'Uncategorized',
        filename: filename,
        url: `/api/admin/clipart/${filename}`,
      }
    });
  } catch (error) {
    console.error('Clipart upload error:', error);
    res.status(500).json({ error: 'Failed to upload clipart', details: error.message });
  }
});

// Admin - Serve clipart image
app.get('/api/admin/clipart/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = join(CLIPART_DIR, filename);
    
    if (!existsSync(filepath)) {
      return res.status(404).json({ error: 'Clipart not found' });
    }
    
    res.sendFile(filepath);
  } catch (error) {
    res.status(500).json({ error: 'Failed to serve clipart' });
  }
});

// Admin - Delete clipart
app.delete('/api/admin/clipart/:filename', checkAdminAuth, async (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = join(CLIPART_DIR, filename);
    
    if (!existsSync(filepath)) {
      return res.status(404).json({ error: 'Clipart not found' });
    }
    
    await fs.remove(filepath);
    
    // Also delete metadata if exists
    const metadataPath = join(CLIPART_DIR, filename.replace(/\.(png|svg|jpg|jpeg)$/i, '.json'));
    if (existsSync(metadataPath)) {
      await fs.remove(metadataPath);
    }
    
    res.json({ success: true, message: 'Clipart deleted successfully' });
  } catch (error) {
    console.error('Failed to delete clipart:', error);
    res.status(500).json({ error: 'Failed to delete clipart', details: error.message });
  }
});

// Admin - Get templates
app.get('/api/admin/templates', checkAdminAuth, async (req, res) => {
  try {
    const templates = [];
    if (existsSync(TEMPLATES_DIR)) {
      const files = await fs.readdir(TEMPLATES_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = join(TEMPLATES_DIR, file);
          const stats = await fs.stat(filePath);
          try {
            const templateData = await fs.readJson(filePath);
            templates.push({
              id: file,
              name: templateData.name || file.replace('.json', ''),
              category: templateData.category || 'Uncategorized',
              filename: file,
              preview_url: templateData.preview_url || null,
              uploaded_at: stats.mtime,
            });
          } catch (e) {
            // Skip invalid JSON files
            console.error('Invalid template file:', file, e);
          }
        }
      }
    }
    res.json({ templates });
  } catch (error) {
    console.error('Failed to get templates:', error);
    res.status(500).json({ error: 'Failed to get templates', details: error.message });
  }
});

// Admin - Upload template
app.post('/api/admin/templates/upload', checkAdminAuth, multer({ 
  dest: TEMPLATES_DIR,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
}).fields([
  { name: 'templateFile', maxCount: 1 },
  { name: 'previewImage', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files || !req.files.templateFile || !req.files.templateFile[0]) {
      return res.status(400).json({ error: 'No template file uploaded' });
    }
    
    const { name, category } = req.body;
    const templateFile = req.files.templateFile[0];
    const previewFile = req.files.previewImage ? req.files.previewImage[0] : null;
    
    // Read and validate template JSON
    const templateData = await fs.readJson(templateFile.path);
    
    // Save template with metadata
    const timestamp = Date.now();
    const templateFilename = `template-${timestamp}.json`;
    const templatePath = join(TEMPLATES_DIR, templateFilename);
    
    const finalTemplateData = {
      ...templateData,
      name: name || templateData.name || 'Untitled Template',
      category: category || templateData.category || 'Uncategorized',
      uploaded_at: new Date().toISOString(),
    };
    
    // Handle preview image if uploaded
    if (previewFile) {
      const previewExt = previewFile.originalname.split('.').pop();
      const previewFilename = `preview-${timestamp}.${previewExt}`;
      const previewPath = join(TEMPLATES_DIR, previewFilename);
      await fs.move(previewFile.path, previewPath);
      finalTemplateData.preview_url = `/api/admin/templates/preview/${previewFilename}`;
    }
    
    await fs.writeJson(templatePath, finalTemplateData);
    await fs.remove(templateFile.path); // Remove temp file
    
    res.json({ 
      success: true, 
      template: {
        id: templateFilename,
        name: finalTemplateData.name,
        category: finalTemplateData.category,
        filename: templateFilename,
        preview_url: finalTemplateData.preview_url,
      }
    });
  } catch (error) {
    console.error('Template upload error:', error);
    res.status(500).json({ error: 'Failed to upload template', details: error.message });
  }
});

// Admin - Serve template preview
app.get('/api/admin/templates/preview/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = join(TEMPLATES_DIR, filename);
    
    if (!existsSync(filepath)) {
      return res.status(404).json({ error: 'Preview not found' });
    }
    
    res.sendFile(filepath);
  } catch (error) {
    res.status(500).json({ error: 'Failed to serve preview' });
  }
});

// Admin - Get template file
app.get('/api/admin/templates/:filename', checkAdminAuth, async (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = join(TEMPLATES_DIR, filename);
    
    if (!existsSync(filepath)) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const templateData = await fs.readJson(filepath);
    res.json(templateData);
  } catch (error) {
    console.error('Failed to get template:', error);
    res.status(500).json({ error: 'Failed to get template', details: error.message });
  }
});

// Admin - Delete template
app.delete('/api/admin/templates/:filename', checkAdminAuth, async (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = join(TEMPLATES_DIR, filename);
    
    if (!existsSync(filepath)) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Read template to get preview URL
    try {
      const templateData = await fs.readJson(filepath);
      if (templateData.preview_url) {
        const previewFilename = templateData.preview_url.split('/').pop();
        const previewPath = join(TEMPLATES_DIR, previewFilename);
        if (existsSync(previewPath)) {
          await fs.remove(previewPath);
        }
      }
    } catch (e) {
      // Ignore errors reading template
    }
    
    await fs.remove(filepath);
    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Failed to delete template:', error);
    res.status(500).json({ error: 'Failed to delete template', details: error.message });
  }
});

// Admin - Get links
app.get('/api/admin/links', checkAdminAuth, async (req, res) => {
  try {
    console.log('GET /api/admin/links - Route hit');
    // Load links from JSON file
    let links = [];
    if (existsSync(LINKS_DB)) {
      try {
        links = await fs.readJson(LINKS_DB);
        console.log(`Loaded ${links.length} links from database`);
      } catch (e) {
        console.error('Failed to read links DB:', e);
        links = [];
      }
    } else {
      console.log('Links DB file does not exist, returning empty array');
    }
    res.json({ links });
  } catch (error) {
    console.error('Failed to get links:', error);
    res.status(500).json({ error: 'Failed to get links', details: error.message });
  }
});

// Admin - Create link
app.post('/api/admin/links', checkAdminAuth, async (req, res) => {
  try {
    const linkData = req.body;
    
    // Load existing links
    let links = [];
    if (existsSync(LINKS_DB)) {
      try {
        links = await fs.readJson(LINKS_DB);
      } catch (e) {
        links = [];
      }
    }
    
    // Generate ID
    const id = `${linkData.sellerId}-${linkData.productCode}-${Date.now()}`;
    const newLink = {
      id,
      productCode: linkData.productCode,
      sellerId: linkData.sellerId,
      returnUrl: linkData.returnUrl,
      volume: linkData.volume || 1,
      mode: linkData.mode || 'BEFORE_BUY_SHOP',
      test: linkData.test || false,
      allowChangeTemplate: linkData.allowChangeTemplate || false,
      customizedParameters: linkData.customizedParameters || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    links.push(newLink);
    
    // Save to file
    await fs.writeJson(LINKS_DB, links, { spaces: 2 });
    
    res.json({ success: true, link: newLink });
  } catch (error) {
    console.error('Failed to create link:', error);
    res.status(500).json({ error: 'Failed to create link', details: error.message });
  }
});

// Admin - Update link
app.put('/api/admin/links/:id', checkAdminAuth, async (req, res) => {
  try {
    const linkId = req.params.id;
    const linkData = req.body;
    
    // Load existing links
    let links = [];
    if (existsSync(LINKS_DB)) {
      try {
        links = await fs.readJson(LINKS_DB);
      } catch (e) {
        links = [];
      }
    }
    
    const linkIndex = links.findIndex(l => l.id === linkId);
    if (linkIndex === -1) {
      return res.status(404).json({ error: 'Link not found' });
    }
    
    // Update link
    links[linkIndex] = {
      ...links[linkIndex],
      productCode: linkData.productCode,
      sellerId: linkData.sellerId,
      returnUrl: linkData.returnUrl,
      volume: linkData.volume || 1,
      mode: linkData.mode || 'BEFORE_BUY_SHOP',
      test: linkData.test || false,
      allowChangeTemplate: linkData.allowChangeTemplate || false,
      customizedParameters: linkData.customizedParameters || null,
      updated_at: new Date().toISOString(),
    };
    
    // Save to file
    await fs.writeJson(LINKS_DB, links, { spaces: 2 });
    
    res.json({ success: true, link: links[linkIndex] });
  } catch (error) {
    console.error('Failed to update link:', error);
    res.status(500).json({ error: 'Failed to update link', details: error.message });
  }
});

// Admin - Delete link
app.delete('/api/admin/links/:id', checkAdminAuth, async (req, res) => {
  try {
    const linkId = req.params.id;
    
    // Load existing links
    let links = [];
    if (existsSync(LINKS_DB)) {
      try {
        links = await fs.readJson(LINKS_DB);
      } catch (e) {
        links = [];
      }
    }
    
    const linkIndex = links.findIndex(l => l.id === linkId);
    if (linkIndex === -1) {
      return res.status(404).json({ error: 'Link not found' });
    }
    
    // Remove link
    links.splice(linkIndex, 1);
    
    // Save to file
    await fs.writeJson(LINKS_DB, links, { spaces: 2 });
    
    res.json({ success: true, message: 'Link deleted successfully' });
  } catch (error) {
    console.error('Failed to delete link:', error);
    res.status(500).json({ error: 'Failed to delete link', details: error.message });
  }
});

// Root endpoint - Serve backend panel HTML (must be after all API routes)
app.get('/', (req, res) => {
  // Check if client wants JSON (API request)
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({
      name: 'Design Tool Backend API',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        health: '/api/health',
        admin: '/api/admin/*',
        designs: '/api/designs',
        products: '/api/products',
        cart: '/api/cart',
        auth: '/api/auth',
        images: '/api/images',
      },
      documentation: 'See README.md or API documentation',
      react_app: REACT_APP_URL,
      wordpress_url: WORDPRESS_URL,
    });
  }
  
  // Serve backend panel HTML page
  res.sendFile(join(__dirname, 'backend.html'));
});

// 404 Handler for API routes (must be before catch-all)
app.use('/api', notFoundHandler);

// Handle non-API routes (must be last, after all API routes)
app.get('*', (req, res) => {
  // Skip if it's an API route (should be handled above)
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // In production, serve React app
  if (process.env.NODE_ENV === 'production') {
    res.sendFile(join(__dirname, '../frontend/build', 'index.html'));
  } else {
    // In development, serve backend panel HTML
    res.sendFile(join(__dirname, 'backend.html'));
  }
});

// Global Error Handler (must be last)
app.use(errorHandler);

// Start server with MongoDB connection
const startServer = async () => {
  try {
    // Try to connect to MongoDB (non-blocking - server will start even if MongoDB fails)
    try {
      await connectDB();
    } catch (dbError) {
      console.warn('⚠️  Server will start without MongoDB connection');
      console.warn('   Some features may not work until MongoDB is available');
    }
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║           Design Tool Backend Server Started             ║
╠═══════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${PORT}                    ║
║  WordPress URL: ${WORDPRESS_URL}                    ║
║  React App URL: ${REACT_APP_URL}                    ║
║  Environment: ${process.env.NODE_ENV || 'development'}                              ║
╚═══════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

export default app;


