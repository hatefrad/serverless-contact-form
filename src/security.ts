import { APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface DistributedRateLimitConfig extends RateLimitConfig {
  tableName: string;
  region: string;
  partitionKeyName: string;
  failOpen: boolean;
}

// Simple in-memory rate limiting (for demo purposes)
// In production, use Redis or DynamoDB for distributed rate limiting
const requestCounts = new Map<string, { count: number; windowStart: number }>();
const dynamoClients = new Map<string, DynamoDBClient>();

function getClientIp(event: APIGatewayProxyEvent): string {
  const forwardedFor = event.headers?.['x-forwarded-for'] || event.headers?.['X-Forwarded-For'];
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const legacySourceIp = event.requestContext?.identity?.sourceIp;
  if (legacySourceIp) {
    return legacySourceIp;
  }

  const httpSourceIp = (
    event.requestContext as APIGatewayProxyEvent['requestContext'] & {
      http?: { sourceIp?: string };
    }
  )?.http?.sourceIp;

  return httpSourceIp || 'unknown';
}

function normalizeAllowedOrigins(allowedDomain: string): string[] {
  return allowedDomain
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

function getDynamoClient(region: string): DynamoDBClient {
  const existing = dynamoClients.get(region);
  if (existing) {
    return existing;
  }

  const client = new DynamoDBClient({ region });
  dynamoClients.set(region, client);
  return client;
}

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
  // In-memory rate limiting only works within a single Lambda instance.
  // Concurrent invocations on separate instances won't share state.
  // Set RATE_LIMIT_TABLE to enable distributed rate limiting via DynamoDB.
  if (process.env.NODE_ENV !== 'test') {
    console.warn(
      '[rate-limit] Using in-memory rate limiting — ineffective across Lambda instances. Set RATE_LIMIT_TABLE for distributed enforcement.'
    );
  }
  const clientIP = getClientIp(event);
  const now = Date.now();

  // Opportunistic cleanup keeps memory bounded without a separate scheduler.
  if (requestCounts.size > 1000 || now % 50 === 0) {
    cleanupRateLimit(config.windowMs);
  }

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
 * Distributed rate limiting backed by DynamoDB.
 * Table requirements:
 * - Partition key (string): default attribute name `id`
 * - TTL attribute (number): `expiresAt` (optional but recommended)
 */
export async function checkRateLimitDistributed(
  event: APIGatewayProxyEvent,
  config: DistributedRateLimitConfig
): Promise<boolean> {
  const clientIp = getClientIp(event);
  const now = Date.now();
  const windowBucket = Math.floor(now / config.windowMs);
  const key = `${clientIp}#${windowBucket}`;
  const expiresAt = Math.floor(now / 1000) + Math.ceil((config.windowMs * 2) / 1000);

  try {
    const dynamo = getDynamoClient(config.region);
    const result = await dynamo.send(
      new UpdateItemCommand({
        TableName: config.tableName,
        Key: {
          [config.partitionKeyName]: { S: key },
        },
        UpdateExpression:
          'SET #count = if_not_exists(#count, :zero) + :inc, #expiresAt = :expiresAt',
        ExpressionAttributeNames: {
          '#count': 'count',
          '#expiresAt': 'expiresAt',
        },
        ExpressionAttributeValues: {
          ':zero': { N: '0' },
          ':inc': { N: '1' },
          ':expiresAt': { N: String(expiresAt) },
        },
        ReturnValues: 'ALL_NEW',
      })
    );

    const currentCount = Number(result.Attributes?.count?.N ?? '0');
    return currentCount <= config.maxRequests;
  } catch (error) {
    console.error('Distributed rate limit error:', error);
    return config.failOpen;
  }
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
  const allowedOrigins = normalizeAllowedOrigins(allowedDomain);

  if (allowedOrigins.includes('*')) {
    return true;
  }

  if (!origin) {
    return false;
  }

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  const hostname = originUrl.hostname.toLowerCase();

  return allowedOrigins.some(allowedOrigin => {
    // Support wildcards like *.example.com (hostname-only match)
    if (allowedOrigin.startsWith('*.')) {
      const domain = allowedOrigin.slice(2).toLowerCase();
      return hostname === domain || hostname.endsWith(`.${domain}`);
    }

    // Normalize exact origin checks to avoid trailing slash mismatches
    try {
      return originUrl.origin === new URL(allowedOrigin).origin;
    } catch {
      return originUrl.origin === allowedOrigin.replace(/\/$/, '');
    }
  });
}

/**
 * Check if the request contains suspicious patterns
 */
export function detectSuspiciousActivity(content: string): boolean {
  const suspiciousPatterns = [
    /<script[\s\S]*?>[\s\S]*?<\/script>/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /data:text\/html/i,
    /vbscript:/i,
    /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/i,
    /<object[\s\S]*?>[\s\S]*?<\/object>/i,
    /<embed[\s\S]*?>[\s\S]*?<\/embed>/i,
  ];

  return suspiciousPatterns.some(pattern => pattern.test(content));
}
