import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { SESClient, SendEmailCommand, SendEmailCommandInput } from '@aws-sdk/client-ses';
import { ContactFormRequest, ContactFormResponse, ErrorResponse } from './types';
import { validateContactForm } from './validation';
import { ContactFormError, ValidationError, EmailServiceError } from './errors';
import { checkRateLimit, detectSuspiciousActivity, validateOrigin, sanitizeInput } from './security';

// Environment variables
const EMAIL = process.env.EMAIL;
const DOMAIN = process.env.DOMAIN || '*';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Initialize SES client
const sesClient = new SESClient({ region: AWS_REGION });

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': DOMAIN,
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json'
};

/**
 * Generates a standardized API response
 */
function generateResponse<T>(
  statusCode: number, 
  payload: T, 
  additionalHeaders: Record<string, string> = {}
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { ...corsHeaders, ...additionalHeaders },
    body: JSON.stringify(payload)
  };
}

/**
 * Generates a standardized error response
 */
function generateErrorResponse(
  statusCode: number, 
  error: string, 
  details?: string
): APIGatewayProxyResult {
  const errorResponse: ErrorResponse = {
    success: false,
    error,
    ...(details && { details })
  };

  console.error(`Error ${statusCode}:`, { error, details });
  
  return generateResponse(statusCode, errorResponse);
}

/**
 * Creates email parameters for SES
 */
function createEmailParams(request: ContactFormRequest): SendEmailCommandInput {
  if (!EMAIL) {
    throw new EmailServiceError('EMAIL environment variable is not configured');
  }

  const subject = request.subject || 'New Contact Form Submission';
  
  return {
    Source: EMAIL,
    Destination: {
      ToAddresses: [EMAIL]
    },
    ReplyToAddresses: [request.email],
    Message: {
      Subject: {
        Charset: 'UTF-8',
        Data: subject
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
          `.trim()
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
          `.trim()
        }
      }
    }
  };
}

/**
 * Sends email using AWS SES
 */
async function sendEmail(emailParams: SendEmailCommandInput): Promise<string> {
  try {
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

  const { value, error } = validateContactForm(parsedBody);
  
  if (error) {
    const errorMessage = error.details
      .map((detail: any) => detail.message)
      .join(', ');
    throw new ValidationError(errorMessage);
  }

  if (!value) {
    throw new ValidationError('Invalid request data');
  }

  return value;
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

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return generateResponse(200, { message: 'CORS preflight successful' });
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return generateErrorResponse(405, 'Method not allowed', 'Only POST requests are supported');
  }

  try {
    // Rate limiting check
    const rateLimitPassed = checkRateLimit(event, { maxRequests: 5, windowMs: 60000 });
    if (!rateLimitPassed) {
      return generateErrorResponse(429, 'Too many requests', 'Please try again later');
    }

    // Origin validation
    const origin = event.headers?.origin || event.headers?.Origin;
    if (!validateOrigin(origin, DOMAIN)) {
      return generateErrorResponse(403, 'Forbidden', 'Invalid origin');
    }

    // Parse and validate request
    const contactRequest = parseRequestBody(event.body);
    
    // Security checks
    if (detectSuspiciousActivity(contactRequest.content)) {
      return generateErrorResponse(400, 'Invalid content', 'Suspicious content detected');
    }

    // Sanitize inputs
    const sanitizedRequest: ContactFormRequest = {
      email: contactRequest.email, // Email validation already handled by Joi
      name: sanitizeInput(contactRequest.name),
      content: sanitizeInput(contactRequest.content),
      subject: contactRequest.subject ? sanitizeInput(contactRequest.subject) : undefined
    };
    
    // Create email parameters
    const emailParams = createEmailParams(sanitizedRequest);
    
    // Send email
    const messageId = await sendEmail(emailParams);
    
    // Success response
    const response: ContactFormResponse = {
      success: true,
      message: 'Your message has been sent successfully!',
      messageId
    };
    
    console.log('Contact form submitted successfully:', {
      messageId,
      email: sanitizedRequest.email,
      name: sanitizedRequest.name,
      timestamp: new Date().toISOString()
    });
    
    return generateResponse(200, response);
    
  } catch (error) {
    if (error instanceof ContactFormError) {
      return generateErrorResponse(error.statusCode, error.message);
    }
    
    // Handle unexpected errors
    console.error('Unexpected error:', error);
    return generateErrorResponse(500, 'Internal server error', 'An unexpected error occurred');
  }
};