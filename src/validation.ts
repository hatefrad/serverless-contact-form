import { z } from 'zod';
import { ContactFormRequest } from './types';

export const contactFormSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Please provide a valid email address'),

  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters long')
    .max(100, 'Name cannot exceed 100 characters')
    .regex(
      /^[a-zA-Z\s\-'\.]+$/,
      'Name can only contain letters, spaces, hyphens, apostrophes, and periods'
    ),

  content: z
    .string({ required_error: 'Message content is required' })
    .trim()
    .min(10, 'Message must be at least 10 characters long')
    .max(5000, 'Message cannot exceed 5000 characters'),

  subject: z.string().trim().max(200, 'Subject cannot exceed 200 characters').optional(),
});

export type ContactFormSchema = z.infer<typeof contactFormSchema>;

export function validateContactForm(
  data: unknown
): { success: true; data: ContactFormRequest } | { success: false; error: string } {
  try {
    const result = contactFormSchema.parse(data);
    return { success: true, data: result as ContactFormRequest };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors.map(err => err.message).join(', ');
      return { success: false, error: errorMessage };
    }
    return { success: false, error: 'Invalid request data' };
  }
}
