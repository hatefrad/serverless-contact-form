import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { SESClient, SendEmailCommand, SendEmailCommandInput } from '@aws-sdk/client-ses';
import { ContactFormRequest, ContactFormResponse, ErrorResponse } from './types';
import { validateContactForm } from './validation';
import { ContactFormError, ValidationError, EmailServiceError } from './errors';
import {
  checkRateLimit,
  detectSuspiciousActivity,
  validateOrigin,
  sanitizeInput,
} from './security';

// Get environment variables (read at runtime for testing flexibility)
const getEnvVars = () => ({
  EMAIL: process.env.EMAIL,
  DOMAIN: process.env.DOMAIN || '*',
  AWS_REGION: process.env.AWS_REGION || 'us-east-1',
  RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
});

function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), max);
}

function getRateLimitConfig(maxRequestsEnv: string | undefined, windowMsEnv: string | undefined) {
  return {
    maxRequests: parsePositiveInt(maxRequestsEnv, 5, 1000),
    windowMs: parsePositiveInt(windowMsEnv, 60000, 60 * 60 * 1000),
  };
}

function getAllowedOrigins(domain: string): string[] {
  return domain
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function resolveCorsOrigin(requestOrigin: string | undefined, configuredDomain: string): string {
  const allowedOrigins = getAllowedOrigins(configuredDomain);
  if (allowedOrigins.includes('*')) {
    return '*';
  }

  if (requestOrigin && validateOrigin(requestOrigin, configuredDomain)) {
    return requestOrigin;
  }

  return allowedOrigins[0] || 'null';
}

// CORS headers factory
const getCorsHeaders = (domain: string, origin?: string) => {
  const resolvedOrigin = resolveCorsOrigin(origin, domain);

  return {
    'Access-Control-Allow-Origin': resolvedOrigin,
    Vary: resolvedOrigin === '*' ? 'Accept-Encoding' : 'Origin, Accept-Encoding',
    'Access-Control-Allow-Headers':
      'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Credentials': resolvedOrigin === '*' ? 'false' : 'true',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Type': 'application/json',
  };
};

/**
 * Generates a standardized API response
 */
function generateResponse<T>(
  statusCode: number,
  payload: T,
  domain: string = '*',
  additionalHeaders: Record<string, string> = {},
  origin?: string
): APIGatewayProxyResult {
  const corsHeaders = getCorsHeaders(domain, origin);
  return {
    statusCode,
    headers: { ...corsHeaders, ...additionalHeaders },
    body: JSON.stringify(payload),
  };
}

/**
 * Generates a standardized error response
 */
function generateErrorResponse(
  statusCode: number,
  error: string,
  domain: string = '*',
  details?: string,
  origin?: string
): APIGatewayProxyResult {
  const errorResponse: ErrorResponse = {
    success: false,
    error,
    ...(details && { details }),
  };

  console.error(`Error ${statusCode}:`, { error, details });

  return generateResponse(statusCode, errorResponse, domain, {}, origin);
}

/**
 * Creates email parameters for SES
 */
function createEmailParams(request: ContactFormRequest, email: string): SendEmailCommandInput {
  if (!email) {
    throw new EmailServiceError('EMAIL environment variable is not configured');
  }

  const subject = request.subject || 'New Contact Form Submission';

  return {
    Source: email,
    Destination: {
      ToAddresses: [email],
    },
    ReplyToAddresses: [request.email],
    Message: {
      Subject: {
        Charset: 'UTF-8',
        Data: subject,
      },
      Body: {
        Text: {
          Charset: 'UTF-8',
          Data: `
New contact form submission:

Name: ${request.name}
Email: ${request.email}
Subject: ${subject}

Message:
${request.content}

---
This message was sent via the contact form.
          `.trim(),
        },
        Html: {
          Charset: 'UTF-8',
          Data: `
<html>
<body>
  <h2>New Contact Form Submission</h2>
  <p><strong>Name:</strong> ${request.name}</p>
  <p><strong>Email:</strong> <a href="mailto:${request.email}">${request.email}</a></p>
  <p><strong>Subject:</strong> ${subject}</p>
  
  <h3>Message:</h3>
  <div style="background-color: #f5f5f5; padding: 15px; border-left: 3px solid #007bff;">
    ${request.content.replace(/\n/g, '<br>')}
  </div>
  
  <hr>
  <p><em>This message was sent via the contact form.</em></p>
</body>
</html>
          `.trim(),
        },
      },
    },
  };
}

/**
 * Sends email using AWS SES
 */
async function sendEmail(emailParams: SendEmailCommandInput, awsRegion: string): Promise<string> {
  try {
    const sesClient = new SESClient({ region: awsRegion });
    const command = new SendEmailCommand(emailParams);
    const result = await sesClient.send(command);

    if (!result.MessageId) {
      throw new EmailServiceError('Failed to send email - no message ID received');
    }

    return result.MessageId;
  } catch (error) {
    console.error('SES Error:', error);

    if (error instanceof Error) {
      throw new EmailServiceError(`Failed to send email: ${error.message}`);
    }

    throw new EmailServiceError('Failed to send email due to unknown error');
  }
}

/**
 * Parses and validates the request body
 */
function parseRequestBody(body: string | null): ContactFormRequest {
  if (!body) {
    throw new ValidationError('Request body is required');
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body);
  } catch (error) {
    throw new ValidationError('Invalid JSON in request body');
  }

  const validation = validateContactForm(parsedBody);

  if (!validation.success) {
    throw new ValidationError(validation.error);
  }

  return validation.data;
}

/**
 * Main Lambda handler for the contact form
 */
export const send = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  // Enable callbackWaitsForEmptyEventLoop for better performance
  context.callbackWaitsForEmptyEventLoop = false;

  // Get environment variables at runtime
  const { EMAIL, DOMAIN, AWS_REGION, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } = getEnvVars();
  const origin = event.headers?.origin || event.headers?.Origin;
  const rateLimitConfig = getRateLimitConfig(RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);

  if (!EMAIL) {
    return generateErrorResponse(
      500,
      'EMAIL environment variable is not configured',
      DOMAIN,
      undefined,
      origin
    );
  }

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    if (!validateOrigin(origin, DOMAIN)) {
      return generateErrorResponse(403, 'Forbidden', DOMAIN, 'Invalid origin', origin);
    }

    return generateResponse(200, { message: 'CORS preflight successful' }, DOMAIN, {}, origin);
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return generateErrorResponse(
      405,
      'Method not allowed',
      DOMAIN,
      'Only POST requests are supported',
      origin
    );
  }

  try {
    // Rate limiting check
    const rateLimitPassed = checkRateLimit(event, rateLimitConfig);
    if (!rateLimitPassed) {
      return generateErrorResponse(
        429,
        'Too many requests',
        DOMAIN,
        'Please try again later',
        origin
      );
    }

    // Origin validation
    if (!validateOrigin(origin, DOMAIN)) {
      return generateErrorResponse(403, 'Forbidden', DOMAIN, 'Invalid origin', origin);
    }

    // Parse and validate request
    const contactRequest = parseRequestBody(event.body);

    // Security checks
    if (
      detectSuspiciousActivity(contactRequest.content) ||
      detectSuspiciousActivity(contactRequest.name) ||
      (contactRequest.subject && detectSuspiciousActivity(contactRequest.subject))
    ) {
      return generateErrorResponse(
        400,
        'Invalid content',
        DOMAIN,
        'Suspicious content detected',
        origin
      );
    }

    // Sanitize inputs
    const sanitizedRequest: ContactFormRequest = {
      email: contactRequest.email, // Email validation already handled by Zod
      name: sanitizeInput(contactRequest.name),
      content: sanitizeInput(contactRequest.content),
      subject: contactRequest.subject ? sanitizeInput(contactRequest.subject) : undefined,
    };

    // Create email parameters
    const emailParams = createEmailParams(sanitizedRequest, EMAIL);

    // Send email
    const messageId = await sendEmail(emailParams, AWS_REGION);

    // Success response
    const response: ContactFormResponse = {
      success: true,
      message: 'Your message has been sent successfully!',
      messageId,
    };

    console.log('Contact form submitted successfully:', {
      messageId,
      email: sanitizedRequest.email,
      name: sanitizedRequest.name,
      timestamp: new Date().toISOString(),
    });

    return generateResponse(200, response, DOMAIN, {}, origin);
  } catch (error) {
    if (error instanceof ContactFormError) {
      return generateErrorResponse(error.statusCode, error.message, DOMAIN, undefined, origin);
    }

    // Handle unexpected errors
    console.error('Unexpected error:', error);
    return generateErrorResponse(
      500,
      'Internal server error',
      DOMAIN,
      'An unexpected error occurred',
      origin
    );
  }
};
