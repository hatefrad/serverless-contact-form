import { APIGatewayProxyEvent } from 'aws-lambda';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

// Simple in-memory rate limiting (for demo purposes)
// In production, use Redis or DynamoDB for distributed rate limiting
const requestCounts = new Map<string, { count: number; windowStart: number }>();

/**
 * Reset rate limiting storage (for testing purposes)
 */
export function resetRateLimit(): void {
  requestCounts.clear();
}

/**
 * Simple rate limiting based on IP address
 */
export function checkRateLimit(event: APIGatewayProxyEvent, config: RateLimitConfig): boolean {
  const clientIP = event.requestContext?.identity?.sourceIp || 'unknown';
  const now = Date.now();

  const existing = requestCounts.get(clientIP);

  if (!existing || now - existing.windowStart > config.windowMs) {
    // New window or first request
    requestCounts.set(clientIP, { count: 1, windowStart: now });
    return true;
  }

  if (existing.count >= config.maxRequests) {
    return false;
  }

  existing.count++;
  return true;
}

/**
 * Clean up old rate limit entries (should be called periodically)
 */
export function cleanupRateLimit(windowMs: number): void {
  const now = Date.now();

  for (const [ip, data] of requestCounts.entries()) {
    if (now - data.windowStart > windowMs * 2) {
      requestCounts.delete(ip);
    }
  }
}

/**
 * Sanitize input string to prevent XSS and injection attacks
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>&"']/g, match => {
      const entityMap: Record<string, string> = {
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entityMap[match] || match;
    })
    .trim();
}

/**
 * Validate origin against allowed domains
 */
export function validateOrigin(origin: string | undefined, allowedDomain: string): boolean {
  if (!origin || allowedDomain === '*') {
    return true;
  }

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  // Support wildcards like *.example.com (hostname-only match)
  if (allowedDomain.startsWith('*.')) {
    const domain = allowedDomain.slice(2).toLowerCase();
    const hostname = originUrl.hostname.toLowerCase();
    return hostname === domain || hostname.endsWith(`.${domain}`);
  }

  // Normalize exact origin checks to avoid trailing slash mismatches
  try {
    return originUrl.origin === new URL(allowedDomain).origin;
  } catch {
    return originUrl.origin === allowedDomain.replace(/\/$/, '');
  }
}

/**
 * Check if the request contains suspicious patterns
 */
export function detectSuspiciousActivity(content: string): boolean {
  const suspiciousPatterns = [
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /data:text\/html/gi,
    /vbscript:/gi,
    /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi,
    /<object[\s\S]*?>[\s\S]*?<\/object>/gi,
    /<embed[\s\S]*?>[\s\S]*?<\/embed>/gi,
  ];

  return suspiciousPatterns.some(pattern => pattern.test(content));
}
