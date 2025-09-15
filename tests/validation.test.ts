import { describe, it, expect } from 'vitest';
import { validateContactForm, contactFormSchema } from '../src/validation';

describe('Contact Form Validation', () => {
  describe('validateContactForm', () => {
    it('should validate a valid contact form', () => {
      const validData = {
        name: 'John Doe',
        email: 'john@example.com',
        content: 'This is a test message with enough content.',
        subject: 'Test Subject'
      };

      const result = validateContactForm(validData);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    it('should validate a contact form without optional subject', () => {
      const validData = {
        name: 'Jane Smith',
        email: 'jane@example.com',
        content: 'This is another test message with sufficient content.'
      };

      const result = validateContactForm(validData);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Jane Smith');
        expect(result.data.email).toBe('jane@example.com');
        expect(result.data.content).toBe('This is another test message with sufficient content.');
        expect(result.data.subject).toBeUndefined();
      }
    });

    it('should fail validation with missing required fields', () => {
      const invalidData = {
        email: 'test@example.com'
        // Missing name and content
      };

      const result = validateContactForm(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Name is required');
        expect(result.error).toContain('Message content is required');
      }
    });

    it('should fail validation with invalid email', () => {
      const invalidData = {
        name: 'John Doe',
        email: 'invalid-email',
        content: 'This is a test message with enough content.'
      };

      const result = validateContactForm(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Please provide a valid email address');
      }
    });

    it('should fail validation with name too short', () => {
      const invalidData = {
        name: 'J',
        email: 'john@example.com',
        content: 'This is a test message with enough content.'
      };

      const result = validateContactForm(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Name must be at least 2 characters long');
      }
    });

    it('should fail validation with name too long', () => {
      const invalidData = {
        name: 'A'.repeat(101),
        email: 'john@example.com',
        content: 'This is a test message with enough content.'
      };

      const result = validateContactForm(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Name cannot exceed 100 characters');
      }
    });

    it('should fail validation with invalid name characters', () => {
      const invalidData = {
        name: 'John123',
        email: 'john@example.com',
        content: 'This is a test message with enough content.'
      };

      const result = validateContactForm(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Name can only contain letters, spaces, hyphens, apostrophes, and periods');
      }
    });

    it('should fail validation with content too short', () => {
      const invalidData = {
        name: 'John Doe',
        email: 'john@example.com',
        content: 'Too short'
      };

      const result = validateContactForm(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Message must be at least 10 characters long');
      }
    });

    it('should fail validation with content too long', () => {
      const invalidData = {
        name: 'John Doe',
        email: 'john@example.com',
        content: 'A'.repeat(5001)
      };

      const result = validateContactForm(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Message cannot exceed 5000 characters');
      }
    });

    it('should fail validation with subject too long', () => {
      const invalidData = {
        name: 'John Doe',
        email: 'john@example.com',
        content: 'This is a test message with enough content.',
        subject: 'A'.repeat(201)
      };

      const result = validateContactForm(invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Subject cannot exceed 200 characters');
      }
    });

    it('should trim whitespace from inputs', () => {
      const dataWithWhitespace = {
        name: '  John Doe  ',
        email: '  john@example.com  ',
        content: '  This is a test message with enough content.  ',
        subject: '  Test Subject  '
      };

      const result = validateContactForm(dataWithWhitespace);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('John Doe');
        expect(result.data.email).toBe('john@example.com');
        expect(result.data.content).toBe('This is a test message with enough content.');
        expect(result.data.subject).toBe('Test Subject');
      }
    });

    it('should accept valid name with special characters', () => {
      const validData = {
        name: "Mary O'Connor-Smith Jr.",
        email: 'mary@example.com',
        content: 'This is a test message with enough content.'
      };

      const result = validateContactForm(validData);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Mary O'Connor-Smith Jr.");
      }
    });
  });

  describe('contactFormSchema direct usage', () => {
    it('should parse valid data with Zod schema', () => {
      const validData = {
        name: 'John Doe',
        email: 'john@example.com',
        content: 'This is a test message with enough content.',
        subject: 'Test Subject'
      };

      expect(() => contactFormSchema.parse(validData)).not.toThrow();
      const result = contactFormSchema.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should throw ZodError for invalid data', () => {
      const invalidData = {
        name: 'J',
        email: 'invalid-email',
        content: 'Short'
      };

      expect(() => contactFormSchema.parse(invalidData)).toThrow();
    });
  });
});