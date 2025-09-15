export class ContactFormError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.name = 'ContactFormError';
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    // Maintains proper stack trace for where error was thrown (Node.js specific)
    if ('captureStackTrace' in Error) {
      (Error as any).captureStackTrace(this, ContactFormError);
    }
  }
}

export class ValidationError extends ContactFormError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

export class EmailServiceError extends ContactFormError {
  constructor(message: string) {
    super(message, 500);
    this.name = 'EmailServiceError';
  }
}