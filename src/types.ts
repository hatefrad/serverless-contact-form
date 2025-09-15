export interface ContactFormRequest {
  email: string;
  name: string;
  content: string;
  subject?: string;
}

export interface ContactFormResponse {
  success: boolean;
  message: string;
  messageId?: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  details?: string;
}

export interface ApiResponse<T = ContactFormResponse | ErrorResponse> {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface LambdaEvent {
  body: string;
  headers: Record<string, string>;
  httpMethod: string;
  path: string;
  queryStringParameters?: Record<string, string>;
}