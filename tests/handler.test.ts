import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { send } from '../src/handler';
import { resetRateLimit } from '../src/security';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// Mock AWS SES
vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn(() => ({
    send: vi.fn()
  })),
  SendEmailCommand: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  
  // Set up environment variables for tests
  process.env.EMAIL = 'test@example.com';
  process.env.DOMAIN = '*';
  process.env.AWS_REGION = 'us-east-1';
  
  // Reset rate limiting state
  resetRateLimit();
});

// Helper function to create mock API Gateway event
const createMockEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent => ({
  body: null,
  headers: {},
  multiValueHeaders: {},
  httpMethod: 'POST',
  isBase64Encoded: false,
  path: '/contact',
  pathParameters: null,
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {
    accountId: '123456789012',
    apiId: 'api-id',
    authorizer: {},
    protocol: 'HTTP/1.1',
    httpMethod: 'POST',
    path: '/contact',
    stage: 'dev',
    requestId: 'request-id',
    requestTime: '01/Jan/1970:00:00:00 +0000',
    requestTimeEpoch: 0,
    resourceId: 'resource-id',
    resourcePath: '/contact',
    identity: {
      accessKey: null,
      accountId: null,
      apiKey: null,
      apiKeyId: null,
      caller: null,
      cognitoAuthenticationProvider: null,
      cognitoAuthenticationType: null,
      cognitoIdentityId: null,
      cognitoIdentityPoolId: null,
      principalOrgId: null,
      sourceIp: '127.0.0.1',
      user: null,
      userAgent: 'test-agent',
      userArn: null,
      clientCert: null
    }
  },
  resource: '/contact',
  ...overrides
});

// Mock context
const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test-function',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
  memoryLimitInMB: '256',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/test-function',
  logStreamName: '2023/01/01/[$LATEST]test-stream',
  getRemainingTimeInMillis: () => 30000,
  done: vi.fn(),
  fail: vi.fn(),
  succeed: vi.fn()
};

describe('Handler', () => {
  describe('send function', () => {
    it('should handle OPTIONS request (CORS preflight)', async () => {
      const event = createMockEvent({
        httpMethod: 'OPTIONS'
      });

      const result = await send(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(result.headers).toHaveProperty('Access-Control-Allow-Origin');
      expect(result.headers).toHaveProperty('Access-Control-Allow-Methods');
      
      const body = JSON.parse(result.body);
      expect(body.message).toBe('CORS preflight successful');
    });

    it('should reject non-POST requests', async () => {
      const event = createMockEvent({
        httpMethod: 'GET'
      });

      const result = await send(event, mockContext);

      expect(result.statusCode).toBe(405);
      
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Method not allowed');
    });

    it('should successfully send email with valid data', async () => {
      const mockSESResponse = {
        MessageId: 'test-message-id-123'
      };

      // Mock SES client
      const mockSESClient = {
        send: vi.fn().mockResolvedValue(mockSESResponse)
      };
      
      vi.mocked(SESClient).mockImplementation(() => mockSESClient as any);

      const validFormData = {
        name: 'John Doe',
        email: 'john@example.com',
        content: 'This is a test message with sufficient content length.',
        subject: 'Test Subject'
      };

      const event = createMockEvent({
        body: JSON.stringify(validFormData),
        headers: {
          'origin': 'https://example.com'
        },
        requestContext: {
          ...createMockEvent().requestContext,
          identity: {
            ...createMockEvent().requestContext.identity,
            sourceIp: '192.168.1.204' // Unique IP
          }
        }
      });

      const result = await send(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(mockSESClient.send).toHaveBeenCalledTimes(1);
      
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Your message has been sent successfully!');
      expect(body.messageId).toBe('test-message-id-123');
    });

    it('should handle validation errors', async () => {
      const invalidFormData = {
        name: 'J', // Too short
        email: 'invalid-email',
        content: 'Short' // Too short
      };

      const event = createMockEvent({
        body: JSON.stringify(invalidFormData)
      });

      const result = await send(event, mockContext);

      expect(result.statusCode).toBe(400);
      
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Name must be at least 2 characters long');
    });

    it('should handle missing request body', async () => {
      const event = createMockEvent({
        body: null
      });

      const result = await send(event, mockContext);

      expect(result.statusCode).toBe(400);
      
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Request body is required');
    });

    it('should handle invalid JSON', async () => {
      const event = createMockEvent({
        body: 'invalid json'
      });

      const result = await send(event, mockContext);

      expect(result.statusCode).toBe(400);
      
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid JSON in request body');
    });

    it('should handle SES errors', async () => {
      const mockSESClient = {
        send: vi.fn().mockRejectedValue(new Error('SES service unavailable'))
      };
      
      vi.mocked(SESClient).mockImplementation(() => mockSESClient as any);

      const validFormData = {
        name: 'John Doe',
        email: 'john@example.com',
        content: 'This is a test message with sufficient content length.'
      };

      const event = createMockEvent({
        body: JSON.stringify(validFormData),
        requestContext: {
          ...createMockEvent().requestContext,
          identity: {
            ...createMockEvent().requestContext.identity,
            sourceIp: '192.168.1.205' // Unique IP
          }
        }
      });

      const result = await send(event, mockContext);

      expect(result.statusCode).toBe(500);
      
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Failed to send email');
    });

    it('should handle rate limiting', async () => {
      const mockSESResponse = {
        MessageId: 'test-message-id-rate-limit'
      };

      const mockSESClient = {
        send: vi.fn().mockResolvedValue(mockSESResponse)
      };
      
      vi.mocked(SESClient).mockImplementation(() => mockSESClient as any);

      const validFormData = {
        name: 'John Doe',
        email: 'john@example.com',
        content: 'This is a test message with sufficient content length.'
      };

      const event = createMockEvent({
        body: JSON.stringify(validFormData),
        requestContext: {
          ...createMockEvent().requestContext,
          identity: {
            ...createMockEvent().requestContext.identity,
            sourceIp: '192.168.1.100' // Consistent IP for rate limiting
          }
        }
      });

      // Make 5 requests (should all succeed)
      for (let i = 0; i < 5; i++) {
        const result = await send(event, mockContext);
        expect(result.statusCode).toBe(200);
      }

      // 6th request should fail with rate limiting
      const rateLimitedResult = await send(event, mockContext);
      expect(rateLimitedResult.statusCode).toBe(429);
      
      const body = JSON.parse(rateLimitedResult.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Too many requests');
    });

    it('should detect suspicious content', async () => {
      const maliciousFormData = {
        name: 'John Doe',
        email: 'john@example.com',
        content: 'This message contains <script>alert("xss")</script> malicious code.'
      };

      const event = createMockEvent({
        body: JSON.stringify(maliciousFormData),
        requestContext: {
          ...createMockEvent().requestContext,
          identity: {
            ...createMockEvent().requestContext.identity,
            sourceIp: '192.168.1.200' // Unique IP
          }
        }
      });

      const result = await send(event, mockContext);

      expect(result.statusCode).toBe(400);
      
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid content');
    });

    it('should validate origin', async () => {
      // Set restrictive domain for this test
      const originalDomain = process.env.DOMAIN;
      process.env.DOMAIN = 'https://example.com';

      const validFormData = {
        name: 'John Doe',
        email: 'john@example.com',
        content: 'This is a test message with sufficient content length.'
      };

      const event = createMockEvent({
        body: JSON.stringify(validFormData),
        headers: {
          'origin': 'https://malicious.com'
        },
        requestContext: {
          ...createMockEvent().requestContext,
          identity: {
            ...createMockEvent().requestContext.identity,
            sourceIp: '192.168.1.201' // Unique IP
          }
        }
      });

      const result = await send(event, mockContext);

      expect(result.statusCode).toBe(403);
      
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Forbidden');

      // Restore original domain
      process.env.DOMAIN = originalDomain;
    });

    it('should sanitize inputs', async () => {
      const mockSESResponse = {
        MessageId: 'test-message-id-456'
      };

      const mockSESClient = {
        send: vi.fn().mockResolvedValue(mockSESResponse)
      };
      
      vi.mocked(SESClient).mockImplementation(() => mockSESClient as any);

      const formDataWithHTML = {
        name: 'John Doe', // Valid name without suspicious content
        email: 'john@example.com',
        content: 'This message has HTML entities like &amp; and quotes.'
      };

      const event = createMockEvent({
        body: JSON.stringify(formDataWithHTML),
        requestContext: {
          ...createMockEvent().requestContext,
          identity: {
            ...createMockEvent().requestContext.identity,
            sourceIp: '192.168.1.202' // Unique IP
          }
        }
      });

      const result = await send(event, mockContext);

      // Should succeed after sanitization
      expect(result.statusCode).toBe(200);
      expect(mockSESClient.send).toHaveBeenCalledTimes(1);

      // Check that the SES command was called with sanitized data
      const sesCall = mockSESClient.send.mock.calls[0][0];
      expect(sesCall).toBeInstanceOf(SendEmailCommand);
    });

    it('should handle missing EMAIL environment variable', async () => {
      const originalEmail = process.env.EMAIL;
      delete process.env.EMAIL;

      const validFormData = {
        name: 'John Doe',
        email: 'john@example.com',
        content: 'This is a test message with sufficient content length.'
      };

      const event = createMockEvent({
        body: JSON.stringify(validFormData),
        requestContext: {
          ...createMockEvent().requestContext,
          identity: {
            ...createMockEvent().requestContext.identity,
            sourceIp: '192.168.1.203' // Unique IP
          }
        }
      });

      const result = await send(event, mockContext);

      expect(result.statusCode).toBe(500);
      
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('EMAIL environment variable is not configured');

      // Restore original email
      if (originalEmail) {
        process.env.EMAIL = originalEmail;
      }
    });
  });
});