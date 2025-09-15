/**
 * Example of how to use the contact form API with vanilla JavaScript
 */

class ContactForm {
  constructor(apiEndpoint) {
    this.apiEndpoint = apiEndpoint;
    this.form = document.getElementById('contact-form');
    this.init();
  }

  init() {
    if (this.form) {
      this.form.addEventListener('submit', this.handleSubmit.bind(this));
    }
  }

  async handleSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(this.form);
    const data = {
      name: formData.get('name'),
      email: formData.get('email'),
      content: formData.get('message'),
      subject: formData.get('subject') || 'Website Contact'
    };

    try {
      this.setLoadingState(true);
      const response = await this.submitForm(data);
      
      if (response.success) {
        this.showMessage('success', 'Thank you! Your message has been sent.');
        this.form.reset();
      } else {
        this.showMessage('error', response.error || 'Failed to send message.');
      }
    } catch (error) {
      console.error('Form submission error:', error);
      this.showMessage('error', 'Network error. Please try again.');
    } finally {
      this.setLoadingState(false);
    }
  }

  async submitForm(data) {
    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return await response.json();
  }

  setLoadingState(isLoading) {
    const submitButton = this.form.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = isLoading;
      submitButton.textContent = isLoading ? 'Sending...' : 'Send Message';
    }
  }

  showMessage(type, message) {
    // Remove existing messages
    const existingMessages = document.querySelectorAll('.contact-message');
    existingMessages.forEach(msg => msg.remove());

    // Create new message
    const messageDiv = document.createElement('div');
    messageDiv.className = `contact-message contact-message--${type}`;
    messageDiv.textContent = message;

    // Insert message after form
    this.form.parentNode.insertBefore(messageDiv, this.form.nextSibling);

    // Auto-remove success messages after 5 seconds
    if (type === 'success') {
      setTimeout(() => {
        if (messageDiv.parentNode) {
          messageDiv.remove();
        }
      }, 5000);
    }
  }
}

// Initialize the contact form
document.addEventListener('DOMContentLoaded', () => {
  const API_ENDPOINT = 'https://your-api-gateway-url/contact';
  new ContactForm(API_ENDPOINT);
});

// CSS styles (add to your stylesheet)
const styles = `
.contact-message {
  padding: 12px 16px;
  margin: 16px 0;
  border-radius: 4px;
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

button[type="submit"]:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
`;

// Add styles to page if not already present
if (!document.querySelector('#contact-form-styles')) {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'contact-form-styles';
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}