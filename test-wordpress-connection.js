import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'http://localhost:8080';

async function testWordPressConnection() {
  console.log('Testing WordPress Connection...\n');
  console.log(`WordPress URL: ${WORDPRESS_URL}\n`);

  // Test 1: WordPress REST API
  try {
    console.log('1. Testing WordPress REST API...');
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/`, {
      timeout: 5000,
    });
    console.log('   ✓ WordPress REST API is accessible');
    console.log(`   Status: ${response.status}`);
    console.log(`   Namespaces: ${Object.keys(response.data.namespaces || {}).join(', ')}\n`);
  } catch (error) {
    console.log('   ✗ WordPress REST API is NOT accessible');
    
    if (error.code === 'ECONNREFUSED') {
      console.log('   → Connection refused: WordPress is not running or wrong port');
      console.log(`   → Check if WordPress is running at: ${WORDPRESS_URL}`);
    } else if (error.code === 'ETIMEDOUT') {
      console.log('   → Connection timeout: WordPress is not responding');
      console.log(`   → Check if WordPress is accessible at: ${WORDPRESS_URL}`);
    } else if (error.code === 'ENOTFOUND') {
      console.log('   → Host not found: Invalid WordPress URL');
      console.log(`   → Verify WORDPRESS_URL in .env file: ${WORDPRESS_URL}`);
    } else if (error.response) {
      console.log(`   → HTTP ${error.response.status}: ${error.response.statusText}`);
      console.log(`   → WordPress responded but with an error`);
    } else {
      console.log(`   → Error: ${error.message}`);
      console.log(`   → Error code: ${error.code || 'Unknown'}`);
    }
    
    console.log('\n   Troubleshooting:');
    console.log('   1. Is WordPress running?');
    console.log('   2. Is the URL correct in .env file?');
    console.log('   3. Try accessing in browser: ' + WORDPRESS_URL);
    console.log('   4. Check firewall/antivirus settings\n');
    
    // Don't return, continue with other tests
  }

  // Test 2: Design Tool API
  try {
    console.log('2. Testing Design Tool API...');
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/design-tool/v1/`, {
      timeout: 5000,
    });
    console.log('   ✓ Design Tool API is accessible');
    if (response.data) {
      console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
    }
    console.log('');
  } catch (error) {
    console.log('   ✗ Design Tool API is NOT accessible');
    if (error.response) {
      console.log(`   → HTTP ${error.response.status}: ${error.response.statusText}`);
      if (error.response.status === 404) {
        console.log('   → Endpoint not found: Plugin may not be activated');
      }
    } else {
      console.log(`   → Error: ${error.message}`);
    }
    console.log('   → Make sure the WooCommerce Design Tool plugin is activated');
    console.log('   → Go to WordPress Admin → Plugins → Activate "WooCommerce Design Tool"\n');
  }

  // Test 3: JWT Auth
  try {
    console.log('3. Testing JWT Authentication...');
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/jwt-auth/v1/`, {
      timeout: 5000,
    });
    console.log('   ✓ JWT Authentication plugin is installed');
    console.log('   → JWT login will be used for authentication\n');
  } catch (error) {
    console.log('   ⚠ JWT Authentication plugin is NOT installed (optional)');
    if (error.response && error.response.status === 404) {
      console.log('   → Plugin not found: This is OK, will use cookie-based auth');
    } else {
      console.log(`   → Error: ${error.message}`);
    }
    console.log('   → To enable JWT: Install "JWT Authentication for WP REST API" plugin');
    console.log('   → Note: Cookie-based authentication will work without JWT\n');
  }

  // Test 4: Auth Login Endpoint
  try {
    console.log('4. Testing Auth Login Endpoint...');
    const response = await axios.post(
      `${WORDPRESS_URL}/wp-json/design-tool/v1/auth/login`,
      { username: 'test', password: 'test' },
      {
        timeout: 5000,
        validateStatus: () => true, // Don't throw on any status
      }
    );
    if (response.status === 400 || response.status === 401) {
      console.log('   ✓ Auth login endpoint exists (returned expected error for test credentials)\n');
    } else {
      console.log(`   ? Auth login endpoint returned status: ${response.status}\n`);
    }
  } catch (error) {
    console.log('   ✗ Auth login endpoint is NOT accessible');
    console.log(`   Error: ${error.message}\n`);
  }

  console.log('Connection test complete!');
}

testWordPressConnection().catch(console.error);

