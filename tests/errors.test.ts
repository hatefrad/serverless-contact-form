import { describe, it, expect } from 'vitest';
import { ContactFormError, ValidationError, EmailServiceError } from '../src/errors';

describe('Custom Error Classes', () => {
  describe('ContactFormError', () => {
    it('should create error with default values', () => {
      const error = new ContactFormError('Test error');
      
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('ContactFormError');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
      expect(error instanceof Error).toBe(true);
      expect(error instanceof ContactFormError).toBe(true);
    });

    it('should create error with custom status code', () => {
      const error = new ContactFormError('Custom error', 400);
      
      expect(error.message).toBe('Custom error');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
    });

    it('should create error with custom operational flag', () => {
      const error = new ContactFormError('System error', 500, false);
      
      expect(error.message).toBe('System error');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false);
    });

    it('should have proper stack trace', () => {
      const error = new ContactFormError('Stack test');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ContactFormError');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with correct properties', () => {
      const error = new ValidationError('Invalid input');
      
      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('ValidationError');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
      expect(error instanceof Error).toBe(true);
      expect(error instanceof ContactFormError).toBe(true);
      expect(error instanceof ValidationError).toBe(true);
    });

    it('should inherit from ContactFormError', () => {
      const error = new ValidationError('Test validation error');
      
      expect(error instanceof ContactFormError).toBe(true);
    });
  });

  describe('EmailServiceError', () => {
    it('should create email service error with correct properties', () => {
      const error = new EmailServiceError('SES failed');
      
      expect(error.message).toBe('SES failed');
      expect(error.name).toBe('EmailServiceError');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
      expect(error instanceof Error).toBe(true);
      expect(error instanceof ContactFormError).toBe(true);
      expect(error instanceof EmailServiceError).toBe(true);
    });

    it('should inherit from ContactFormError', () => {
      const error = new EmailServiceError('Test email error');
      
      expect(error instanceof ContactFormError).toBe(true);
    });
  });

  describe('Error inheritance chain', () => {
    it('should maintain proper inheritance for ValidationError', () => {
      const error = new ValidationError('Test');
      
      expect(error instanceof Error).toBe(true);
      expect(error instanceof ContactFormError).toBe(true);
      expect(error instanceof ValidationError).toBe(true);
      expect(error instanceof EmailServiceError).toBe(false);
    });

    it('should maintain proper inheritance for EmailServiceError', () => {
      const error = new EmailServiceError('Test');
      
      expect(error instanceof Error).toBe(true);
      expect(error instanceof ContactFormError).toBe(true);
      expect(error instanceof EmailServiceError).toBe(true);
      expect(error instanceof ValidationError).toBe(false);
    });
  });

  describe('Error serialization', () => {
    it('should serialize ContactFormError properties', () => {
      const error = new ContactFormError('Serialization test', 400);
      
      // Test that custom properties are accessible
      expect(Object.prototype.hasOwnProperty.call(error, 'statusCode')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(error, 'isOperational')).toBe(true);
      
      // Test property values
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
    });

    it('should handle error message properly', () => {
      const message = 'Error with special characters: <>"\' & symbols';
      const error = new ContactFormError(message);
      
      expect(error.message).toBe(message);
      expect(error.toString()).toContain(message);
    });
  });
});