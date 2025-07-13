/**
 * Test script for the updated sendOtp utility function
 * This script tests the EJS template integration
 */

require('dotenv').config();
const sendOtp = require('./utils/sendOtp');

async function testOtpEmail() {
  console.log('🧪 Testing OTP email with EJS template...\n');
  
  // Test user data
  const testUser = {
    name: 'John Doe',
    email: 'test@example.com'
  };
  
  const testOtp = '123456';
  
  try {
    console.log('📤 Sending test OTP email...');
    await sendOtp(testUser, testOtp);
    console.log('\n✅ Test completed successfully!');
    console.log('📧 Check your console output for the email content (if using mock email)');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Test with user name
testOtpEmail().then(() => {
  console.log('\n🧪 Testing with user without name...\n');
  
  // Test without user name
  const testUserNoName = {
    email: 'test2@example.com'
  };
  
  return sendOtp(testUserNoName, '654321');
}).then(() => {
  console.log('\n✅ All tests completed!');
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});