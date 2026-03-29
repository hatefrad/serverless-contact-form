# Serverless Contact Form API

Production-ready contact form backend using TypeScript, AWS Lambda, API Gateway,
and AWS SES.

It is designed for secure public form submission with strong abuse controls,
predictable behavior under retries, and flexible deployment configuration.

## Highlights

- Strong input validation with Zod
- SES email delivery with typed AWS SDK v3
- CORS allow-list support with wildcard subdomains and multi-origin config
- Rate limiting in-memory by default, optional distributed mode via DynamoDB
- Idempotency-key deduplication to prevent duplicate sends
- Optional CAPTCHA verification for high-volume abuse
- Honeypot trap for low-cost bot filtering
- Structured error responses and explicit HTTP status handling
- Comprehensive automated tests with Vitest

## Architecture

- Runtime: Node.js 20 on AWS Lambda
- Entry point: POST /contact
- Email transport: AWS SES
- Optional data stores:
  - Distributed rate limit table (DynamoDB)
  - Idempotency table (DynamoDB)

## Quick Start

### Prerequisites

- Node.js 20+
- AWS CLI configured
- AWS SES identity verified for sender email

### Install

```bash
npm install
```

### Configure

Create `secrets.json` from your sample and set values similar to:

```json
{
  "EMAIL": "your-verified-email@example.com",
  "DOMAIN": "https://yourwebsite.com",
  "AWS_REGION": "us-east-1",
  "SES_IDENTITY_ARN": "arn:aws:ses:us-east-1:123456789012:identity/your-verified-email@example.com",
  "RATE_LIMIT_MAX_REQUESTS": "5",
  "RATE_LIMIT_WINDOW_MS": "60000",
  "RATE_LIMIT_TABLE": "contact-form-rate-limit",
  "RATE_LIMIT_PARTITION_KEY": "id",
  "RATE_LIMIT_FAIL_OPEN": "true",
  "IDEMPOTENCY_TTL_MS": "600000",
  "IDEMPOTENCY_TABLE": "contact-form-idempotency",
  "IDEMPOTENCY_PARTITION_KEY": "id",
  "IDEMPOTENCY_FAIL_OPEN": "true",
  "CAPTCHA_SECRET": "optional-provider-secret",
  "CAPTCHA_VERIFY_URL": "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  "CAPTCHA_TOKEN_HEADER": "x-captcha-token",
  "CAPTCHA_FAIL_OPEN": "false"
}
```

### Run Locally

```bash
npm run offline
```

### Deploy

```bash
npm run deploy
```

## API Contract

### Endpoint

- `POST /contact`

### Request Body

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "content": "Hello, I would like to get in touch.",
  "subject": "Website Contact"
}
```

### Optional Headers

- `Idempotency-Key` or `X-Idempotency-Key`
- `X-Captcha-Token` (or custom header via `CAPTCHA_TOKEN_HEADER`)

### Success Response

```json
{
  "success": true,
  "message": "Your message has been sent successfully!",
  "messageId": "ses-message-id"
}
```

For duplicate idempotency submissions, returns `200` with header
`Idempotency-Replayed: true` and does not send another email.

### Error Response

```json
{
  "success": false,
  "error": "Validation failed",
  "details": "Name must be at least 2 characters long"
}
```

### Status Codes

- `200` success (or replay acknowledged)
- `400` validation/captcha request errors
- `403` forbidden (origin/captcha verification failure)
- `405` method not allowed
- `429` rate limit exceeded
- `500` internal server error
- `503` captcha provider unavailable when fail-closed

## Security Model

### Validation and Sanitization

- Strict Zod schema validation
- Character and length constraints
- HTML entity sanitization for user-provided fields
- Suspicious payload pattern detection

### Origin and CORS

- Exact origin allow-list support
- Wildcard subdomains (`*.example.com`)
- Comma-separated origin configuration
- Proper preflight validation

### Abuse Controls

- Honeypot field (`_honeypot`) for naive bot detection
- Rate limiting with configurable window and threshold
- Optional distributed rate limiting in DynamoDB
- Optional CAPTCHA challenge verification

### Duplicate Submission Protection

- Optional idempotency-key handling
- Prevents retries/double-click duplicate sends
- In-memory or DynamoDB-backed dedupe store

## Configuration Reference

Required:

- `EMAIL` verified SES sender
- `DOMAIN` allowed origin(s) or `*`
- `AWS_REGION` AWS region

Recommended:

- `SES_IDENTITY_ARN` scope SES IAM permissions to identity ARN

Rate limiting:

- `RATE_LIMIT_MAX_REQUESTS` default `5`
- `RATE_LIMIT_WINDOW_MS` default `60000`
- `RATE_LIMIT_TABLE` optional DynamoDB table
- `RATE_LIMIT_PARTITION_KEY` default `id`
- `RATE_LIMIT_FAIL_OPEN` default `true`

Idempotency:

- `IDEMPOTENCY_TTL_MS` default `600000`
- `IDEMPOTENCY_TABLE` optional DynamoDB table
- `IDEMPOTENCY_PARTITION_KEY` default `id`
- `IDEMPOTENCY_FAIL_OPEN` default `true`

CAPTCHA:

- `CAPTCHA_SECRET` enables verification when set
- `CAPTCHA_VERIFY_URL` provider endpoint
- `CAPTCHA_TOKEN_HEADER` default `x-captcha-token`
- `CAPTCHA_FAIL_OPEN` default `false`

## DynamoDB Table Notes

Distributed rate limit table:

- Partition key: String (`id` by default)
- TTL attribute: Number `expiresAt` (recommended)

Idempotency table:

- Partition key: String (`id` by default)
- TTL attribute: Number `expiresAt` (recommended)

## Development

### Scripts

```bash
npm run build
npm run deploy
npm run deploy:dev
npm run deploy:prod
npm run offline
npm run lint
npm run lint:fix
npm run format
npm run type-check
npm run validate
npm test
npm run test:watch
npm run test:ui
npm run test:coverage
```

### Project Structure

```text
src/
  handler.ts
  security.ts
  validation.ts
  errors.ts
  types.ts
tests/
examples/
serverless.yml
```

## Testing

The test suite covers:

- Handler behavior and response contracts
- Validation rules and edge cases
- Security utilities (origin checks, rate limiting, sanitizer)
- Distributed rate limit behavior and fail-open/fail-closed semantics
- Idempotency and CAPTCHA flow behavior

Run:

```bash
npm test
```

## Operations and Troubleshooting

Check first:

- CloudWatch logs for request and error context
- SES sending status and identity verification
- CORS origin configuration (`DOMAIN`)
- CAPTCHA provider health and token header wiring
- DynamoDB table names, IAM access, and TTL settings

## License

MIT
