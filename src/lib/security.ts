import { NextResponse } from 'next/server';

// Input sanitization utilities
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  
  // Remove HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');
  
  // Trim and limit length
  return sanitized.trim().substring(0, 10000);
}

// Validate redirect URLs to prevent open redirects
export function validateRedirectUrl(url: string, allowedOrigins: string[]): boolean {
  try {
    const parsed = new URL(url);
    
    // Only allow relative paths or same-origin redirects
    if (parsed.origin !== 'null') {
      // External URL - check against allowed origins
      return allowedOrigins.some(origin => parsed.origin === origin);
    }
    
    // Relative path - ensure it starts with /
    return parsed.pathname.startsWith('/');
  } catch {
    // Invalid URL - check if it's a relative path
    return url.startsWith('/') && !url.startsWith('//');
  }
}

// Rate limiting (simple in-memory implementation)
const rateLimitMap = new Map<string, { count: number; timestamp: number }>();

export function checkRateLimit(
  key: string,
  limit: number = 100,
  windowMs: number = 60000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  const record = rateLimitMap.get(key);
  
  if (!record || record.timestamp < windowStart) {
    // New window or no record
    rateLimitMap.set(key, { count: 1, timestamp: now });
    return { allowed: true, remaining: limit - 1 };
  }
  
  if (record.count >= limit) {
    return { allowed: false, remaining: 0 };
  }
  
  record.count++;
  return { allowed: true, remaining: limit - record.count };
}

// Validate and sanitize API inputs
export function validateApiInput(body: any, requiredFields: string[]): {
  valid: boolean;
  error?: string;
  sanitized?: any;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }
  
  const sanitized: any = {};
  
  for (const field of requiredFields) {
    if (!(field in body)) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
    
    const value = body[field];
    
    if (typeof value === 'string') {
      sanitized[field] = sanitizeInput(value);
      
      // Additional validation for specific fields
      if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitized[field])) {
        return { valid: false, error: 'Invalid email format' };
      }
      
      if (field === 'content' && sanitized[field].length === 0) {
        return { valid: false, error: `${field} cannot be empty` };
      }
    } else if (typeof value === 'number') {
      // Validate numbers
      if (isNaN(value) || !isFinite(value)) {
        return { valid: false, error: `Invalid ${field}` };
      }
      sanitized[field] = value;
    } else if (typeof value === 'boolean') {
      sanitized[field] = value;
    } else if (Array.isArray(value)) {
      // Sanitize array items
      sanitized[field] = value.map(item => 
        typeof item === 'string' ? sanitizeInput(item) : item
      );
    } else {
      sanitized[field] = value;
    }
  }
  
  return { valid: true, sanitized };
}

// Create standardized error response
export function createErrorResponse(
  message: string,
  status: number = 400,
  details?: any
): NextResponse {
  const response: any = { error: message };
  
  // Only include details in development
  if (process.env.NODE_ENV === 'development' && details) {
    response.details = details;
  }
  
  return NextResponse.json(response, { status });
}

// Create standardized success response
export function createSuccessResponse(
  data: any,
  status: number = 200
): NextResponse {
  return NextResponse.json(data, { status });
}