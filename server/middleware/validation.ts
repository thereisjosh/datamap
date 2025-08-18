import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import { fileUploadSchema, sanitizeString, sanitizeFilename } from '@shared/validation-schemas';

// Enhanced error formatting for better security
interface ValidationErrorResponse {
  success: false;
  error: string;
  details?: Array<{
    field: string;
    message: string;
  }>;
  timestamp: string;
}

// Security-focused error handler that doesn't leak sensitive information
const formatValidationError = (error: ZodError): ValidationErrorResponse => {
  const details = error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message
  }));

  return {
    success: false,
    error: 'Validation failed',
    details,
    timestamp: new Date().toISOString()
  };
};

// Generic validation middleware factory
export function validateSchema<T>(schema: ZodSchema<T>, target: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      let dataToValidate: any;
      
      switch (target) {
        case 'body':
          dataToValidate = req.body;
          break;
        case 'query':
          dataToValidate = req.query;
          break;
        case 'params':
          dataToValidate = req.params;
          break;
        default:
          throw new Error('Invalid validation target');
      }

      const validatedData = schema.parse(dataToValidate);
      
      // Replace the original data with validated/sanitized data
      if (target === 'body') {
        req.body = validatedData;
      } else if (target === 'query') {
        req.query = validatedData as any;
      } else if (target === 'params') {
        req.params = validatedData as any;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        console.warn('🚫 Validation failed:', {
          target,
          errors: error.errors,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path
        });
        
        return res.status(400).json(formatValidationError(error));
      }
      
      console.error('❌ Validation middleware error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal validation error',
        timestamp: new Date().toISOString()
      });
    }
  };
}

// File upload validation middleware
export function validateFileUpload(options?: {
  maxSize?: number;
  allowedMimeTypes?: string[];
  required?: boolean;
}) {
  const defaultOptions = {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ],
    required: true
  };
  
  const config = { ...defaultOptions, ...options };

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if file is required but missing
      if (config.required && !req.file) {
        return res.status(400).json({
          success: false,
          error: 'File upload is required',
          timestamp: new Date().toISOString()
        });
      }

      // If file is optional and not provided, continue
      if (!config.required && !req.file) {
        return next();
      }

      const file = req.file!;

      // Validate file size
      if (file.size > config.maxSize) {
        return res.status(400).json({
          success: false,
          error: `File size exceeds maximum allowed size of ${config.maxSize / (1024 * 1024)}MB`,
          timestamp: new Date().toISOString()
        });
      }

      // Validate MIME type
      if (!config.allowedMimeTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          error: `File type not allowed. Allowed types: ${config.allowedMimeTypes.join(', ')}`,
          timestamp: new Date().toISOString()
        });
      }

      // Validate filename
      if (!file.originalname || file.originalname.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid filename',
          timestamp: new Date().toISOString()
        });
      }

      // Sanitize filename
      file.originalname = sanitizeFilename(file.originalname);

      // Additional security checks
      const suspiciousPatterns = [
        /\.exe$/i,
        /\.bat$/i,
        /\.cmd$/i,
        /\.scr$/i,
        /\.pif$/i,
        /\.com$/i,
        /javascript:/i,
        /data:/i
      ];

      if (suspiciousPatterns.some(pattern => pattern.test(file.originalname))) {
        console.warn('🚨 Suspicious file upload attempt:', {
          filename: file.originalname,
          mimetype: file.mimetype,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        
        return res.status(400).json({
          success: false,
          error: 'File contains suspicious content',
          timestamp: new Date().toISOString()
        });
      }

      // Log successful file upload for monitoring
      console.log('📁 File upload validated:', {
        filename: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        ip: req.ip
      });

      next();
    } catch (error) {
      console.error('❌ File validation error:', error);
      return res.status(500).json({
        success: false,
        error: 'File validation failed',
        timestamp: new Date().toISOString()
      });
    }
  };
}

// Content sanitization middleware
export function sanitizeInput(fields: string[] = ['message', 'description', 'name', 'query']) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.body && typeof req.body === 'object') {
        fields.forEach(field => {
          if (req.body[field] && typeof req.body[field] === 'string') {
            req.body[field] = sanitizeString(req.body[field]);
          }
        });
      }

      // Sanitize query parameters
      if (req.query && typeof req.query === 'object') {
        Object.keys(req.query).forEach(key => {
          if (typeof req.query[key] === 'string') {
            req.query[key] = sanitizeString(req.query[key] as string);
          }
        });
      }

      next();
    } catch (error) {
      console.error('❌ Input sanitization error:', error);
      return res.status(500).json({
        success: false,
        error: 'Input sanitization failed',
        timestamp: new Date().toISOString()
      });
    }
  };
}

// Request size validation middleware
export function validateRequestSize(maxBodySize: number = 50 * 1024 * 1024) { // 50MB default
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.get('content-length') || '0');
    
    if (contentLength > maxBodySize) {
      console.warn('🚫 Request size exceeded:', {
        contentLength,
        maxAllowed: maxBodySize,
        ip: req.ip,
        path: req.path
      });
      
      return res.status(413).json({
        success: false,
        error: 'Request entity too large',
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  };
}

// Rate limiting context extraction middleware
export function extractRateLimitContext() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Extract user context for rate limiting
    const rateLimitContext = {
      userId: (req as any).user?.id || null,
      organizationId: (req as any).user?.activeOrganizationId || null,
      projectId: req.body?.projectId || req.query?.projectId || null,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent') || null
    };

    // Attach to request for use by rate limiters
    (req as any).rateLimitContext = rateLimitContext;
    next();
  };
}

// Security headers middleware for API responses
export function secureApiResponse() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Don't cache sensitive API responses
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    
    next();
  };
}

// Validation error tracking for security monitoring
export function trackValidationErrors() {
  return (error: any, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof ZodError || (error.name && error.name === 'ValidationError')) {
      console.warn('🔍 Validation error tracked:', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        errorCount: error.errors?.length || 1,
        timestamp: new Date().toISOString()
      });
    }
    
    next(error);
  };
}