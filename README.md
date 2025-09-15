# Serverless Contact Form API

A modern, secure, and scalable contact form API built with TypeScript, AWS Lambda, and AWS SES. This serverless solution provides a robust backend for handling contact form submissions with comprehensive validation, security features, and error handling.

## ✨ Features

- **TypeScript**: Full type safety and modern JavaScript features
- **AWS Lambda**: Serverless architecture for cost-effective scaling
- **AWS SES**: Reliable email delivery service
- **Input Validation**: Comprehensive validation using Joi
- **Security**: Rate limiting, input sanitization, and XSS protection
- **Error Handling**: Structured error responses with proper HTTP status codes
- **CORS Support**: Configurable cross-origin resource sharing
- **Modern AWS SDK**: Uses AWS SDK v3 for better performance
- **Development Tools**: ESLint, Prettier, and TypeScript tooling

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- AWS CLI configured with appropriate permissions
- An AWS account with SES access

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd serverless-contact-form
   npm install
   ```

2. **Configure AWS SES:**
   - Verify your email address in AWS SES console
   - If in sandbox mode, verify both sender and recipient emails

3. **Set up environment variables:**
   ```bash
   cp secrets.example.json secrets.json
   ```
   
   Update `secrets.json` with your configuration:
   ```json
   {
     "EMAIL": "your-verified-email@example.com",
     "DOMAIN": "https://yourwebsite.com",
     "AWS_REGION": "us-east-1"
   }
   ```

4. **Deploy to AWS:**
   ```bash
   npm run deploy
   ```

### Local Development

Run the API locally for development:

```bash
npm run offline
```

The API will be available at `http://localhost:3000/dev/contact`

## 📡 API Documentation

### Endpoint

**POST** `/contact`

Sends a contact form email via AWS SES.

### Request Format

```json
{
  "name": "John Doe",
  "email": "john@example.com", 
  "content": "Hello, I would like to get in touch...",
  "subject": "Website Contact" // Optional
}
```

### Request Validation

- **name**: 2-100 characters, letters, spaces, hyphens, apostrophes, and periods only
- **email**: Valid email address format
- **content**: 10-5000 characters
- **subject**: Optional, max 200 characters

### Response Format

**Success (200):**
```json
{
  "success": true,
  "message": "Your message has been sent successfully!",
  "messageId": "0123456789abcdef-12345678-1234-1234-1234-123456789012-000000"
}
```

**Error (400/500):**
```json
{
  "success": false,
  "error": "Validation failed",
  "details": "Name must be at least 2 characters long"
}
```

### HTTP Status Codes

- `200` - Success
- `400` - Bad Request (validation errors, suspicious content)
- `403` - Forbidden (invalid origin)
- `405` - Method Not Allowed (non-POST requests)
- `429` - Too Many Requests (rate limiting)
- `500` - Internal Server Error

## 🔒 Security Features

### Rate Limiting
- 5 requests per minute per IP address
- Configurable limits in the code

### Input Sanitization
- HTML entity encoding for special characters
- XSS prevention
- Suspicious content detection

### CORS Protection
- Configurable allowed origins
- Proper preflight handling
- Credential support

### Validation
- Comprehensive input validation with Joi
- Email format validation
- Content length limits
- Character set restrictions

## 🛠️ Development

### Available Scripts

```bash
# Build TypeScript
npm run build

# Deploy to AWS
npm run deploy
npm run deploy:dev    # Deploy to dev stage
npm run deploy:prod   # Deploy to prod stage

# Local development
npm run offline

# Code quality
npm run lint          # Run ESLint
npm run lint:fix      # Fix ESLint issues
npm run format        # Format with Prettier
npm run type-check    # TypeScript type checking
npm run validate      # Run all checks

# Testing
npm test              # Run tests
npm run test:watch    # Run tests in watch mode

# Cleanup
npm run clean         # Remove build files
npm run remove        # Remove AWS deployment
```

### Project Structure

```
├── src/
│   ├── handler.ts      # Main Lambda handler
│   ├── types.ts        # TypeScript interfaces
│   ├── validation.ts   # Input validation with Joi
│   ├── errors.ts       # Custom error classes
│   └── security.ts     # Security utilities
├── examples/           # Usage examples
├── tests/             # Test files
├── serverless.yml     # Serverless Framework config
├── tsconfig.json      # TypeScript config
├── package.json       # Dependencies and scripts
└── secrets.json       # Environment variables (gitignored)
```

## 🔧 Configuration

### Environment Variables

Configure these in `secrets.json` or as environment variables:

- `EMAIL`: Your verified SES email address (required)
- `DOMAIN`: Allowed origin domain (default: `*`)
- `AWS_REGION`: AWS region for SES (default: `us-east-1`)

### Serverless Configuration

The `serverless.yml` file includes:

- Node.js 20.x runtime
- Automatic TypeScript compilation with esbuild
- AWS X-Ray tracing
- CloudWatch logs
- IAM permissions for SES
- CORS configuration

## 🌐 Frontend Integration

### JavaScript/Fetch Example

```javascript
async function submitContactForm(formData) {
  try {
    const response = await fetch('https://your-api-gateway-url/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: formData.name,
        email: formData.email,
        content: formData.message,
        subject: formData.subject || 'Website Contact'
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('Message sent successfully!');
    } else {
      console.error('Error:', result.error);
    }
  } catch (error) {
    console.error('Network error:', error);
  }
}
```

### React Example

```jsx
import { useState } from 'react';

export default function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    content: '',
    subject: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const result = await response.json();
      setMessage(result.success ? 'Message sent!' : result.error);
    } catch (error) {
      setMessage('Failed to send message');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Sending...' : 'Send Message'}
      </button>
      {message && <p>{message}</p>}
    </form>
  );
}
```

## 📊 Monitoring & Logging

### CloudWatch Logs
- All requests are logged with timestamps
- Error details and stack traces
- Performance metrics

### AWS X-Ray Tracing
- Request tracing enabled
- Performance monitoring
- Service dependency mapping

## 🚨 Troubleshooting

### Common Issues

1. **Email not delivered**
   - Verify SES email addresses
   - Check SES sending limits
   - Review CloudWatch logs

2. **CORS errors**
   - Verify DOMAIN configuration
   - Check allowed origins in serverless.yml

3. **Rate limiting**
   - Implement distributed rate limiting for production
   - Consider using Redis or DynamoDB

4. **Deployment errors**
   - Ensure AWS credentials are configured
   - Check IAM permissions
   - Verify region settings

### Getting Help

- Check CloudWatch logs for detailed error messages
- Use AWS X-Ray for request tracing
- Enable debug mode in serverless offline

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

---

**Happy coding! 🚀**
