import Joi from 'joi';
import { ContactFormRequest } from './types';

export const contactFormSchema = Joi.object<ContactFormRequest>({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  
  name: Joi.string()
    .min(2)
    .max(100)
    .trim()
    .pattern(/^[a-zA-Z\s\-'\.]+$/)
    .required()
    .messages({
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name cannot exceed 100 characters',
      'string.pattern.base': 'Name can only contain letters, spaces, hyphens, apostrophes, and periods',
      'any.required': 'Name is required'
    }),
  
  content: Joi.string()
    .min(10)
    .max(5000)
    .trim()
    .required()
    .messages({
      'string.min': 'Message must be at least 10 characters long',
      'string.max': 'Message cannot exceed 5000 characters',
      'any.required': 'Message content is required'
    }),
  
  subject: Joi.string()
    .max(200)
    .trim()
    .optional()
    .messages({
      'string.max': 'Subject cannot exceed 200 characters'
    })
});

export function validateContactForm(data: unknown): { value: ContactFormRequest; error?: never } | { error: Joi.ValidationError; value?: never } {
  return contactFormSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
}