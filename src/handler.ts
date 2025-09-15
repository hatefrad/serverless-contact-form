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
});

// CORS headers factory
const getCorsHeaders = (domain: string) => ({
  'Access-Control-Allow-Origin': domain,
  'Access-Control-Allow-Headers':
    'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
});

/**
 * Generates a standardized API response
 */
function generateResponse<T>(
  statusCode: number,
  payload: T,
  domain: string = '*',
  additionalHeaders: Record<string, string> = {}
): APIGatewayProxyResult {
  const corsHeaders = getCorsHeaders(domain);
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
  details?: string
): APIGatewayProxyResult {
  const errorResponse: ErrorResponse = {
    success: false,
    error,
    ...(details && { details }),
  };

  console.error(`Error ${statusCode}:`, { error, details });

  return generateResponse(statusCode, errorResponse, domain);
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
  const { EMAIL, DOMAIN, AWS_REGION } = getEnvVars();

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return generateResponse(200, { message: 'CORS preflight successful' }, DOMAIN);
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return generateErrorResponse(
      405,
      'Method not allowed',
      DOMAIN,
      'Only POST requests are supported'
    );
  }

  try {
    // Rate limiting check
    const rateLimitPassed = checkRateLimit(event, { maxRequests: 5, windowMs: 60000 });
    if (!rateLimitPassed) {
      return generateErrorResponse(429, 'Too many requests', DOMAIN, 'Please try again later');
    }

    // Origin validation
    const origin = event.headers?.origin || event.headers?.Origin;
    if (!validateOrigin(origin, DOMAIN)) {
      return generateErrorResponse(403, 'Forbidden', DOMAIN, 'Invalid origin');
    }

    // Parse and validate request
    const contactRequest = parseRequestBody(event.body);

    // Security checks
    if (detectSuspiciousActivity(contactRequest.content)) {
      return generateErrorResponse(400, 'Invalid content', DOMAIN, 'Suspicious content detected');
    }

    // Sanitize inputs
    const sanitizedRequest: ContactFormRequest = {
      email: contactRequest.email, // Email validation already handled by Zod
      name: sanitizeInput(contactRequest.name),
      content: sanitizeInput(contactRequest.content),
      subject: contactRequest.subject ? sanitizeInput(contactRequest.subject) : undefined,
    };

    // Create email parameters
    const emailParams = createEmailParams(sanitizedRequest, EMAIL!);

    // Send email
    const messageId = await sendEmail(emailParams, AWS_REGION!);

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

    return generateResponse(200, response, DOMAIN);
  } catch (error) {
    if (error instanceof ContactFormError) {
      return generateErrorResponse(error.statusCode, error.message, DOMAIN);
    }

    // Handle unexpected errors
    console.error('Unexpected error:', error);
    return generateErrorResponse(
      500,
      'Internal server error',
      DOMAIN,
      'An unexpected error occurred'
    );
  }
};
