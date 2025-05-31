// Test script to verify OpenAI API connection
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read config
const configPath = join(__dirname, 'public', 'config.js');
const configContent = fs.readFileSync(configPath, 'utf8');

// Extract API key from config (simple regex approach)
const apiKeyMatch = configContent.match(/apiKey:\s*['"`]([^'"`]+)['"`]/);
if (!apiKeyMatch) {
  console.error('❌ Could not find API key in config.js');
  process.exit(1);
}

const apiKey = apiKeyMatch[1];
console.log('🔍 Found API key (first 20 chars):', apiKey.substring(0, 20) + '...');

// Test connection using the same logic as testOpenAIConnection()
async function testConnection() {
  console.log('🧪 Testing OpenAI connection...');
  console.log('Using endpoint: https://api.openai.com/v1/chat/completions');
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{
          role: "user",
          content: "test"
        }],
        max_tokens: 1
      })
    });

    console.log('📊 Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: { message: errorText } };
      }

      if (response.status === 429) {
        if (errorData.error?.code === 'insufficient_quota' || 
            errorData.error?.message?.includes('quota') ||
            errorData.error?.message?.includes('billing')) {
          console.log('❌ QUOTA EXCEEDED - This is the root cause!');
          console.log('📄 Error details:', errorData.error.message);
          console.log('💡 Solution: Fix your OpenAI billing at https://platform.openai.com/account/billing');
          return false;
        } else {
          console.log('✅ Rate limited, but this means the API key is valid!');
          console.log('✅ Connection test would return: { success: true, note: "Rate limited but valid key" }');
          return true;
        }
      }
      if (response.status === 401) {
        console.log('❌ Authentication failed - API key is invalid');
        return false;
      }
      console.log(`⚠️ HTTP ${response.status} but proceeding anyway`);
      return true;
    }

    const data = await response.json();
    console.log('✅ Connection test successful!');
    console.log('📄 Response data:', data);
    
    if (data.usage) {
      console.log('💰 Tokens consumed:', data.usage.total_tokens);
      console.log('💰 This should appear in OpenAI dashboard!');
    }
    
    return true;

  } catch (error) {
    console.error('❌ Network error:', error.message);
    // Check if API key looks valid
    if (apiKey && apiKey.startsWith('sk-') && apiKey.length > 40) {
      console.log('⚠️ Network error but API key looks valid - would proceed');
      return true;
    }
    return false;
  }
}

// Run tests
async function runFinalTests() {
  console.log('🎯 OpenAI API Connection Test - FINAL VERSION');
  console.log('='.repeat(60));
  
  const connectionOk = await testConnection();
  console.log('\n📋 Connection Test Result:', connectionOk ? '✅ PASS' : '❌ FAIL');
  
  if (connectionOk) {
    console.log('\n🎯 Since connection test passes, useOpenAI should be true in the app');
    console.log('🔍 But if API calls still fail with quota errors, that explains everything!');
  } else {
    console.log('\n❌ Connection test failed - this explains why no API calls are made');
  }

  console.log('\n🏆 INVESTIGATION COMPLETE!');
  console.log('💡 Check the final diagnosis page for complete analysis:');
  console.log('   http://localhost:3000/main_page/final-diagnosis.html');
}

runFinalTests().catch(console.error);

// Now test a real API call that should consume credits
async function testRealAPICall() {
  console.log('\n🚀 Testing REAL API call that will consume credits...');
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{
          role: "user",
          content: "Say exactly: API_TEST_SUCCESS"
        }],
        max_tokens: 10
      })
    });

    console.log('📊 Real API call status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Real API call failed:', errorText);
      return false;
    }

    const data = await response.json();
    console.log('✅ Real API call successful!');
    console.log('📄 Response:', data.choices[0].message.content);
    
    if (data.usage) {
      console.log('💰 CREDITS CONSUMED:', data.usage.total_tokens, 'tokens');
      console.log('💰 Prompt tokens:', data.usage.prompt_tokens);
      console.log('💰 Completion tokens:', data.usage.completion_tokens);
      console.log('💰 Request ID:', data.id);
      console.log('💰 This should now appear in your OpenAI dashboard!');
    }
    
    return true;

  } catch (error) {
    console.error('❌ Real API call error:', error.message);
    return false;
  }
}

// Run tests
async function runTests() {
  console.log('🧪 OpenAI API Connection Test');
  console.log('=' * 50);
  
  const connectionOk = await testConnection();
  console.log('\n📋 Connection Test Result:', connectionOk ? '✅ PASS' : '❌ FAIL');
  
  if (connectionOk) {
    console.log('\n🎯 Since connection test passes, useOpenAI should be true in the app');
    
    const realCallOk = await testRealAPICall();
    console.log('\n📋 Real API Call Result:', realCallOk ? '✅ PASS' : '❌ FAIL');
    
    if (realCallOk) {
      console.log('\n🎉 SUCCESS! API calls are working and consuming credits.');
      console.log('📈 Check your OpenAI dashboard at https://platform.openai.com/usage');
    }
  } else {
    console.log('\n❌ Connection test failed - this explains why no API calls are made');
  }
}

runTests().catch(console.error);
