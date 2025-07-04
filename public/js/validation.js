/**
 * Comprehensive Form Validation Utility for LacedUp Application
 * Handles both user and admin form validation with flash messages
 */

class FormValidator {
  constructor(formId, options = {}) {
    this.form = document.getElementById(formId);
    this.options = {
      showGeneralError: true,
      showFieldErrors: true,
      ...options
    };
    this.errors = {};
    this.init();
  }

  init() {
    if (!this.form) return;
    
    // Remove HTML5 validation
    this.form.setAttribute('novalidate', 'true');
    
    // Add event listeners
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    
    // Add blur event listeners to all inputs
    const inputs = this.form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      input.addEventListener('blur', () => this.validateField(input));
      input.addEventListener('input', () => this.clearFieldError(input));
    });
  }

  handleSubmit(e) {
    e.preventDefault();
    this.clearAllErrors();
    
    const isValid = this.validateForm();
    
    if (isValid) {
      // If validation passes, submit the form
      this.submitForm();
    }
  }

  validateForm() {
    const inputs = this.form.querySelectorAll('input[required], select[required], textarea[required]');
    let isValid = true;
    let emptyFields = 0;
    let totalRequiredFields = inputs.length;

    inputs.forEach(input => {
      const fieldValid = this.validateField(input);
      if (!fieldValid) {
        isValid = false;
        if (!input.value.trim()) {
          emptyFields++;
        }
      }
    });

    // Show general error if all fields are empty or multiple fields are missing
    if (emptyFields === totalRequiredFields || emptyFields > 1) {
      this.showGeneralError('All fields are required');
      return false;
    }

    return isValid;
  }

  validateField(input) {
    const value = input.value.trim();
    const fieldName = input.name || input.id;
    const fieldType = input.type;
    let isValid = true;
    let errorMessage = '';

    // Clear previous error
    this.clearFieldError(input);

    // Required field validation
    if (input.hasAttribute('required') && !value) {
      errorMessage = `${this.getFieldLabel(input)} is required`;
      isValid = false;
    }
    // Field-specific validations
    else if (value) {
      switch (fieldName.toLowerCase()) {
        case 'name':
        case 'categoryname':
          const nameValidation = this.validateName(value);
          if (!nameValidation.isValid) {
            errorMessage = nameValidation.message;
            isValid = false;
          } else {
            // Auto-capitalize name
            input.value = this.capitalizeName(value);
          }
          break;
        case 'brand':
          const brandValidation = this.validateBrand(value);
          if (!brandValidation.isValid) {
            errorMessage = brandValidation.message;
            isValid = false;
          }
          break;

        case 'productname':
          const productNameValidation = this.validateProductName(value);
          if (!productNameValidation.isValid) {
            errorMessage = productNameValidation.message;
            isValid = false;
          } else {
            // Auto-capitalize product name
            input.value = this.capitalizeName(value);
          }
          break;

        case 'features':
          // Features field accepts any text content - no validation constraints
          // Just ensure minimum length for meaningful content
          if (value.length < 3) {
            errorMessage = 'Features should be at least 3 characters long';
            isValid = false;
          }
          break;

        case 'phone':
          const phoneValidation = this.validatePhone(value);
          if (!phoneValidation.isValid) {
            errorMessage = phoneValidation.message;
            isValid = false;
          }
          break;

        case 'email':
          const emailValidation = this.validateEmail(value);
          if (!emailValidation.isValid) {
            errorMessage = emailValidation.message;
            isValid = false;
          } else {
            // Apply trim to email
            input.value = value.trim();
          }
          break;

        case 'password':
          const passwordValidation = this.validatePassword(value);
          if (!passwordValidation.isValid) {
            errorMessage = passwordValidation.message;
            isValid = false;
          }
          break;

        case 'confirmpassword':
          const confirmPasswordValidation = this.validateConfirmPassword(value);
          if (!confirmPasswordValidation.isValid) {
            errorMessage = confirmPasswordValidation.message;
            isValid = false;
          }
          break;

        case 'regularprice':
        case 'saleprice':
        case 'stock':
        case 'productoffer':
          const numberValidation = this.validateNumber(value, fieldName);
          if (!numberValidation.isValid) {
            errorMessage = numberValidation.message;
            isValid = false;
          }
          break;

        case 'description':
          // Description validation (optional but if provided, should be meaningful)
          if (value && value.length < 10) {
            errorMessage = 'Description should be at least 10 characters long';
            isValid = false;
          }
          break;
      }
    }

    if (!isValid && errorMessage) {
      this.showFieldError(input, errorMessage);
    }

    return isValid;
  }

  validateName(value) {
    // Only alphabetic characters and spaces, minimum 2 characters
    const nameRegex = /^[a-zA-Z\s]+$/;

    if (value.length < 2) {
      return { isValid: false, message: 'Name must be at least 2 characters long' };
    }

    if (!nameRegex.test(value)) {
      return { isValid: false, message: 'Name should contain only alphabetic characters and spaces' };
    }

    return { isValid: true };
  }

  validateBrand(value) {
    // Allow alphanumeric characters, spaces, and common special characters
    // Supports brands like "Nike", "Adidas Originals", "Under Armour", "361°", "New Balance", "Puma x BMW"
    const brandRegex = /^[a-zA-Z0-9\s\-'°.&×x+]+$/;

    if (value.length < 2) {
      return { isValid: false, message: 'Brand name must be at least 2 characters long' };
    }

    if (!brandRegex.test(value)) {
      return { isValid: false, message: 'Brand name contains invalid characters' };
    }

    return { isValid: true };
  }

  validateProductName(value) {
    // Alphanumeric characters, spaces, and common product symbols, minimum 2 characters
    const productNameRegex = /^[a-zA-Z0-9\s\-\+\&\(\)\.]+$/;

    if (value.length < 2) {
      return { isValid: false, message: 'Product name must be at least 2 characters long' };
    }

    if (!productNameRegex.test(value)) {
      return { isValid: false, message: 'Product name should contain only letters, numbers, spaces, and common symbols (-, +, &, (), .)' };
    }

    return { isValid: true };
  }

  validatePhone(value) {
    // Must start with 6, 7, 8, or 9 and be exactly 10 digits
    const phoneRegex = /^[6-9]\d{9}$/;
    
    if (!phoneRegex.test(value)) {
      return { isValid: false, message: 'Phone number must start with 6, 7, 8, or 9 and be exactly 10 digits' };
    }
    
    return { isValid: true };
  }

  validateEmail(value) {
    // Must contain @, at least one dot after @, and end with valid domain
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const domainRegex = /\.(com|org|net|edu|gov|mil|int|co|in|uk|de|fr|jp|au|ca)$/i;
    
    if (!emailRegex.test(value)) {
      return { isValid: false, message: 'Please enter a valid email address' };
    }
    
    if (!domainRegex.test(value)) {
      return { isValid: false, message: 'Email must end with a valid domain (com, org, net, etc.)' };
    }
    
    return { isValid: true };
  }

  validatePassword(value) {
    if (value.length < 6) {
      return { isValid: false, message: 'Password must be at least 6 characters long' };
    }
    
    return { isValid: true };
  }

  validateConfirmPassword(value) {
    const passwordField = this.form.querySelector('input[name="password"]');
    
    if (passwordField && value !== passwordField.value) {
      return { isValid: false, message: 'Passwords do not match' };
    }
    
    return { isValid: true };
  }

  validateNumber(value, fieldName) {
    const num = parseFloat(value);

    if (isNaN(num) || num < 0) {
      return { isValid: false, message: `${this.getFieldLabel({ name: fieldName })} must be a valid positive number` };
    }

    if (fieldName === 'stock' && !Number.isInteger(num)) {
      return { isValid: false, message: 'Stock must be a whole number' };
    }

    if (fieldName === 'productoffer' && num > 100) {
      return { isValid: false, message: 'Product offer cannot exceed 100%' };
    }

    // Validate price relationships for product forms
    if (fieldName === 'saleprice') {
      const regularPriceField = this.form.querySelector('input[name="regularPrice"]');
      if (regularPriceField && regularPriceField.value) {
        const regularPrice = parseFloat(regularPriceField.value);
        if (!isNaN(regularPrice) && num > regularPrice) {
          return { isValid: false, message: 'Sale price cannot be higher than regular price' };
        }
      }
    }

    return { isValid: true };
  }

  capitalizeName(name) {
    return name.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  getFieldLabel(input) {
    const label = this.form.querySelector(`label[for="${input.id}"]`);
    if (label) return label.textContent.replace('*', '').trim();
    
    // Fallback to field name with proper formatting
    return input.name.charAt(0).toUpperCase() + input.name.slice(1).replace(/([A-Z])/g, ' $1');
  }

  showGeneralError(message) {
    this.clearGeneralError();
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-danger validation-error general-error';
    errorDiv.textContent = message;
    
    this.form.insertBefore(errorDiv, this.form.firstChild);
  }

  showFieldError(input, message) {
    this.clearFieldError(input);
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'text-danger small validation-error field-error mt-1';
    errorDiv.textContent = message;
    
    // Insert error message after the input field
    input.parentNode.insertBefore(errorDiv, input.nextSibling);
    
    // Add error styling to input
    input.classList.add('is-invalid');
  }

  clearFieldError(input) {
    // Remove error styling
    input.classList.remove('is-invalid');
    
    // Remove error message
    const errorDiv = input.parentNode.querySelector('.field-error');
    if (errorDiv) {
      errorDiv.remove();
    }
  }

  clearGeneralError() {
    const errorDiv = this.form.querySelector('.general-error');
    if (errorDiv) {
      errorDiv.remove();
    }
  }

  clearAllErrors() {
    // Clear general error
    this.clearGeneralError();
    
    // Clear all field errors
    const inputs = this.form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => this.clearFieldError(input));
  }

  submitForm() {
    // Create a new form submission event
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    
    // Temporarily remove our validation handler
    this.form.removeEventListener('submit', this.handleSubmit);
    
    // Submit the form
    this.form.dispatchEvent(submitEvent);
    
    // Re-add our validation handler
    setTimeout(() => {
      this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }, 100);
  }
}

// Global validation utility
window.FormValidator = FormValidator;
