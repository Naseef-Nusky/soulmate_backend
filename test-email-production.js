import 'dotenv/config';
import { verifySmtpAndSendTest } from './src/services/email.js';

// Test email configuration
async function testEmail() {
  console.log('🔍 Testing Email Configuration (SendGrid)...\n');
  
  // Check environment variables
  const sendGridApiKey = process.env.SENDGRID_API_KEY;
  const emailFrom = process.env.EMAIL_FROM || 'soulmate@gurulink.app';
  
  console.log('📋 Configuration:');
  console.log(`   SendGrid API Key: ${sendGridApiKey ? '✅ SET' : '❌ MISSING'}`);
  console.log(`   Email From: ${emailFrom}`);
  console.log('');
  
  if (!sendGridApiKey) {
    console.error('❌ Email is NOT configured!');
    console.error('   Please set SENDGRID_API_KEY in your .env file');
    console.error('   Get your API key from: https://app.sendgrid.com/settings/api_keys');
    process.exit(1);
  }
  
  // Test email sending
  const testEmail = process.argv[2] || emailFrom;
  console.log(`📧 Sending test email to: ${testEmail}`);
  console.log('');
  
  try {
    const messageId = await verifySmtpAndSendTest(testEmail);
    console.log('✅ Email sent successfully!');
    console.log(`   Message ID: ${messageId}`);
    console.log(`   Check your inbox at: ${testEmail}`);
    console.log('');
    console.log('💡 If email not received:');
    console.log('   1. Check spam/junk folder');
    console.log('   2. Verify sender email in SendGrid dashboard');
    console.log('   3. Check SendGrid activity logs');
  } catch (error) {
    console.error('❌ Failed to send email:');
    console.error(`   Error: ${error.message || error}`);
    console.error('');
    console.error('💡 Common issues:');
    console.error('   1. API key invalid - verify it starts with SG.');
    console.error('   2. Sender email not verified in SendGrid');
    console.error('   3. Check SendGrid dashboard for rate limits');
    console.error('   4. Free tier allows 100 emails/day');
    process.exit(1);
  }
}

testEmail().catch(console.error);

