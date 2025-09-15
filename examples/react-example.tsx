import React, { useState } from 'react';

interface ContactFormData {
  name: string;
  email: string;
  content: string;
  subject: string;
}

interface ContactFormProps {
  apiEndpoint: string;
  onSuccess?: (response: any) => void;
  onError?: (error: string) => void;
}

export const ContactForm: React.FC<ContactFormProps> = ({ 
  apiEndpoint, 
  onSuccess, 
  onError 
}) => {
  const [formData, setFormData] = useState<ContactFormData>({
    name: '',
    email: '',
    content: '',
    subject: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    
    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });
      
      const result = await response.json();
      
      if (result.success) {
        setMessage({ type: 'success', text: 'Thank you! Your message has been sent.' });
        setFormData({ name: '', email: '', content: '', subject: '' });
        onSuccess?.(result);
      } else {
        const errorMessage = result.error || 'Failed to send message';
        setMessage({ type: 'error', text: errorMessage });
        onError?.(errorMessage);
      }
    } catch (error) {
      const errorMessage = 'Network error. Please try again.';
      setMessage({ type: 'error', text: errorMessage });
      onError?.(errorMessage);
      console.error('Form submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="contact-form">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="name">Name *</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            minLength={2}
            maxLength={100}
            placeholder="Your full name"
            disabled={isSubmitting}
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="email">Email *</label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            placeholder="your.email@example.com"
            disabled={isSubmitting}
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="subject">Subject</label>
          <input
            type="text"
            id="subject"
            name="subject"
            value={formData.subject}
            onChange={handleChange}
            maxLength={200}
            placeholder="What is this about?"
            disabled={isSubmitting}
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="content">Message *</label>
          <textarea
            id="content"
            name="content"
            value={formData.content}
            onChange={handleChange}
            required
            minLength={10}
            maxLength={5000}
            placeholder="Your message here..."
            disabled={isSubmitting}
            rows={6}
          />
        </div>
        
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Sending...' : 'Send Message'}
        </button>
      </form>
      
      {message && (
        <div className={`contact-message contact-message--${message.type}`}>
          {message.text}
        </div>
      )}
      
      <style jsx>{`
        .contact-form {
          max-width: 600px;
          margin: 0 auto;
        }
        
        .form-group {
          margin-bottom: 20px;
        }
        
        label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #333;
        }
        
        input, textarea {
          width: 100%;
          padding: 12px;
          border: 2px solid #ddd;
          border-radius: 6px;
          font-size: 16px;
          transition: border-color 0.3s ease;
          font-family: inherit;
        }
        
        input:focus, textarea:focus {
          outline: none;
          border-color: #007bff;
        }
        
        input:disabled, textarea:disabled {
          background-color: #f8f9fa;
          cursor: not-allowed;
        }
        
        textarea {
          resize: vertical;
          min-height: 120px;
        }
        
        button {
          background-color: #007bff;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 16px;
          cursor: pointer;
          transition: background-color 0.3s ease;
        }
        
        button:hover:not(:disabled) {
          background-color: #0056b3;
        }
        
        button:disabled {
          background-color: #6c757d;
          cursor: not-allowed;
        }
        
        .contact-message {
          padding: 12px 16px;
          margin: 16px 0;
          border-radius: 6px;
          font-size: 14px;
        }
        
        .contact-message--success {
          background-color: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }
        
        .contact-message--error {
          background-color: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }
      `}</style>
    </div>
  );
};

// Usage example:
export default function ContactPage() {
  const API_ENDPOINT = 'https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com/dev/contact';
  
  const handleSuccess = (response: any) => {
    console.log('Message sent successfully:', response);
    // Add any additional success handling here
  };
  
  const handleError = (error: string) => {
    console.error('Failed to send message:', error);
    // Add any additional error handling here
  };
  
  return (
    <div>
      <h1>Contact Us</h1>
      <p>Send us a message using the form below.</p>
      <ContactForm 
        apiEndpoint={API_ENDPOINT}
        onSuccess={handleSuccess}
        onError={handleError}
      />
    </div>
  );
}