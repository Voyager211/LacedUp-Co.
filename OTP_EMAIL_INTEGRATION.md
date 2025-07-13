# OTP Email Template Integration

## Overview
The `sendOtp` utility function has been successfully updated to use the modern EJS email template instead of basic template literals. This provides a professional, responsive email design with enhanced styling and branding.

## Changes Made

### 1. Updated Utility Function (`utils/sendOtp.js`)

#### New Imports Added:
```javascript
const ejs = require('ejs');
const path = require('path');
```

#### Key Changes:
- **EJS Template Rendering**: Replaced template literal HTML with `ejs.renderFile()`
- **Path Resolution**: Uses `path.join()` for cross-platform compatibility
- **Error Handling**: Added comprehensive error handling with fallback HTML
- **Enhanced Logging**: Added success/error logging for better debugging
- **Backward Compatibility**: Maintains the same function signature and behavior

#### Template Data Passed:
```javascript
{
  user: {
    name: user.name || 'Valued Customer',
    email: user.email
  },
  otp: otp
}
```

### 2. Updated EJS Template (`views/user/partials/otp-email.ejs`)

#### Fixed Issues:
- **Logo URL**: Updated placeholder with actual Cloudinary logo URL
- **Responsive Design**: Maintained existing mobile-responsive styling
- **Brand Consistency**: Uses LacedUp branding and colors

## Features

### ✅ Modern Design
- Professional gradient header
- Responsive layout for mobile devices
- Clean typography and spacing
- Brand-consistent colors and styling

### ✅ Security Features
- Prominent expiry warning (2 minutes)
- Security tips and warnings
- Clear instructions for users

### ✅ Error Handling
- Graceful fallback to basic HTML if template fails
- Detailed error logging
- Template not found protection

### ✅ Backward Compatibility
- Same function signature as before
- Works with existing mock/real email logic
- No breaking changes to calling code

## Testing

### Quick Test
Run the provided test script:
```bash
node test-otp-email.js
```

### Manual Testing
```javascript
const sendOtp = require('./utils/sendOtp');

// Test with user name
await sendOtp({
  name: 'John Doe',
  email: 'test@example.com'
}, '123456');

// Test without user name (uses fallback)
await sendOtp({
  email: 'test2@example.com'
}, '654321');
```

### Expected Behavior
1. **Success Case**: Beautiful HTML email with modern styling
2. **Template Error**: Falls back to basic styled HTML
3. **Network Error**: Throws error (as before)

## Environment Configuration

### Mock Email (Development)
Set in `.env`:
```
MOCK_EMAIL=true
```
- Emails will be logged to console
- No actual emails sent
- Perfect for development testing

### Real Email (Production)
Set in `.env`:
```
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
MOCK_EMAIL=false
```

## File Structure
```
utils/
├── sendOtp.js          # Updated utility function
├── sendEmail.js        # Real email service
└── mockEmail.js        # Mock email service

views/user/partials/
└── otp-email.ejs       # Modern email template

test-otp-email.js       # Test script
```

## Error Scenarios Handled

1. **Template Not Found**: Falls back to basic HTML
2. **EJS Rendering Error**: Falls back to basic HTML  
3. **Email Service Error**: Throws error (existing behavior)
4. **Missing User Data**: Uses fallback values

## Performance Considerations

- **Template Caching**: EJS automatically caches compiled templates
- **Path Resolution**: Computed once per function call
- **Fallback HTML**: Minimal overhead for error cases
- **Memory Usage**: No significant increase

## Security Considerations

- **Template Injection**: EJS automatically escapes variables
- **Path Traversal**: Uses `path.join()` for safe path construction
- **Data Validation**: Validates user object structure
- **Error Information**: Doesn't expose sensitive data in errors

## Maintenance

### Updating the Template
1. Edit `views/user/partials/otp-email.ejs`
2. Test with `node test-otp-email.js`
3. Deploy changes

### Adding New Variables
1. Update template with new EJS variables
2. Update `sendOtp.js` to pass new data
3. Update this documentation

### Troubleshooting
- Check console logs for detailed error messages
- Verify template path exists
- Test with mock email first
- Check EJS syntax if template fails

## Migration Notes

### For Existing Code
No changes required! The function signature remains the same:
```javascript
// This still works exactly as before
await sendOtp(user, otpCode);
```

### For New Features
You can now rely on professional email styling without additional work.

## Future Enhancements

Potential improvements:
- [ ] Multiple language support
- [ ] Dynamic branding based on environment
- [ ] Email analytics integration
- [ ] A/B testing for email templates
- [ ] Dark mode email support