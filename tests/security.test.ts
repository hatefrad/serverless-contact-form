import { describe, it, expect } from 'vitest';
import { 
  checkRateLimit, 
  detectSuspiciousActivity, 
  validateOrigin, 
  sanitizeInput,
  cleanupRateLimit 
} from '../src/security';
import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock APIGatewayProxyEvent for testing
const createMockEvent = (sourceIp: string): Partial<APIGatewayProxyEvent> => ({
  requestContext: {
    identity: {
      sourceIp
    }
  } as any
});

describe('Security Utilities', () => {
  describe('checkRateLimit', () => {
    it('should allow requests within rate limit', () => {
      const event = createMockEvent('192.168.1.1') as APIGatewayProxyEvent;
      const config = { maxRequests: 5, windowMs: 60000 };

      // First request should be allowed
      expect(checkRateLimit(event, config)).toBe(true);
      
      // Subsequent requests within limit should be allowed
      for (let i = 0; i < 4; i++) {
        expect(checkRateLimit(event, config)).toBe(true);
      }
    });

    it('should block requests exceeding rate limit', () => {
      const event = createMockEvent('192.168.1.2') as APIGatewayProxyEvent;
      const config = { maxRequests: 3, windowMs: 60000 };

      // First 3 requests should be allowed
      for (let i = 0; i < 3; i++) {
        expect(checkRateLimit(event, config)).toBe(true);
      }

      // 4th request should be blocked
      expect(checkRateLimit(event, config)).toBe(false);
    });

    it('should reset rate limit after window expires', () => {
      const event = createMockEvent('192.168.1.3') as APIGatewayProxyEvent;
      const config = { maxRequests: 2, windowMs: 100 }; // Short window for testing

      // Exhaust rate limit
      expect(checkRateLimit(event, config)).toBe(true);
      expect(checkRateLimit(event, config)).toBe(true);
      expect(checkRateLimit(event, config)).toBe(false);

      // Wait for window to expire
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Should be allowed again after window reset
          expect(checkRateLimit(event, config)).toBe(true);
          resolve();
        }, 150);
      });
    });

    it('should handle unknown IP addresses', () => {
      const event = {} as APIGatewayProxyEvent; // No requestContext
      const config = { maxRequests: 5, windowMs: 60000 };

      expect(checkRateLimit(event, config)).toBe(true);
    });
  });

  describe('detectSuspiciousActivity', () => {
    it('should detect script tags', () => {
      const maliciousContent = 'Hello <script>alert("xss")</script> world';
      expect(detectSuspiciousActivity(maliciousContent)).toBe(true);
    });

    it('should detect javascript: protocols', () => {
      const maliciousContent = 'Click here: javascript:alert("xss")';
      expect(detectSuspiciousActivity(maliciousContent)).toBe(true);
    });

    it('should detect event handlers', () => {
      const maliciousContent = 'Hello <div onclick="alert()">world</div>';
      expect(detectSuspiciousActivity(maliciousContent)).toBe(true);
    });

    it('should detect data URLs', () => {
      const maliciousContent = 'data:text/html,<script>alert("xss")</script>';
      expect(detectSuspiciousActivity(maliciousContent)).toBe(true);
    });

    it('should detect vbscript', () => {
      const maliciousContent = 'vbscript:msgbox("xss")';
      expect(detectSuspiciousActivity(maliciousContent)).toBe(true);
    });

    it('should detect iframe tags', () => {
      const maliciousContent = '<iframe src="javascript:alert()"></iframe>';
      expect(detectSuspiciousActivity(maliciousContent)).toBe(true);
    });

    it('should allow safe content', () => {
      const safeContent = 'Hello, this is a normal message with no suspicious content.';
      expect(detectSuspiciousActivity(safeContent)).toBe(false);
    });

    it('should allow content with safe HTML-like text', () => {
      const safeContent = 'I love <3 programming and writing code!';
      expect(detectSuspiciousActivity(safeContent)).toBe(false);
    });
  });

  describe('validateOrigin', () => {
    it('should allow any origin when domain is *', () => {
      expect(validateOrigin('https://example.com', '*')).toBe(true);
      expect(validateOrigin('https://malicious.com', '*')).toBe(true);
      expect(validateOrigin(undefined, '*')).toBe(true);
    });

    it('should allow exact domain matches', () => {
      expect(validateOrigin('https://example.com', 'https://example.com')).toBe(true);
      expect(validateOrigin('https://example.com', 'https://other.com')).toBe(false);
    });

    it('should handle wildcard subdomains', () => {
      expect(validateOrigin('https://api.example.com', '*.example.com')).toBe(true);
      expect(validateOrigin('https://www.example.com', '*.example.com')).toBe(true);
      expect(validateOrigin('https://example.com', '*.example.com')).toBe(true);
      expect(validateOrigin('https://other.com', '*.example.com')).toBe(false);
    });

    it('should allow undefined origin when domain is *', () => {
      expect(validateOrigin(undefined, '*')).toBe(true);
    });

    it('should handle undefined origin with specific domain', () => {
      expect(validateOrigin(undefined, 'https://example.com')).toBe(true);
    });
  });

  describe('sanitizeInput', () => {
    it('should escape HTML special characters', () => {
      const input = '<script>alert("xss")</script>';
      const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
      expect(sanitizeInput(input)).toBe(expected);
    });

    it('should escape ampersands', () => {
      const input = 'Tom & Jerry';
      const expected = 'Tom &amp; Jerry';
      expect(sanitizeInput(input)).toBe(expected);
    });

    it('should escape quotes', () => {
      const input = 'He said "Hello" and she said \'Hi\'';
      const expected = 'He said &quot;Hello&quot; and she said &#39;Hi&#39;';
      expect(sanitizeInput(input)).toBe(expected);
    });

    it('should trim whitespace', () => {
      const input = '  Hello World  ';
      const expected = 'Hello World';
      expect(sanitizeInput(input)).toBe(expected);
    });

    it('should handle normal text without changes', () => {
      const input = 'This is normal text with numbers 123 and symbols !@#$%^*()_+-=[]{}|;:,./';
      expect(sanitizeInput(input)).toBe(input.trim());
    });

    it('should handle empty strings', () => {
      expect(sanitizeInput('')).toBe('');
      expect(sanitizeInput('   ')).toBe('');
    });
  });

  describe('cleanupRateLimit', () => {
    it('should remove old entries', () => {
      // This test is more integration-focused since the rate limit storage is internal
      const event1 = createMockEvent('192.168.1.10') as APIGatewayProxyEvent;
      const event2 = createMockEvent('192.168.1.11') as APIGatewayProxyEvent;
      const config = { maxRequests: 5, windowMs: 100 };

      // Create some entries
      checkRateLimit(event1, config);
      checkRateLimit(event2, config);

      // Clean up with a long window - should not affect current entries
      cleanupRateLimit(100);

      // These should still work normally (not cleaned up)
      expect(checkRateLimit(event1, config)).toBe(true);
      expect(checkRateLimit(event2, config)).toBe(true);

      // Wait and clean up with expired window
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          cleanupRateLimit(50); // Clean entries older than 50ms
          
          // Should work as if starting fresh (entries were cleaned)
          expect(checkRateLimit(event1, config)).toBe(true);
          expect(checkRateLimit(event2, config)).toBe(true);
          resolve();
        }, 200);
      });
    });
  });
});