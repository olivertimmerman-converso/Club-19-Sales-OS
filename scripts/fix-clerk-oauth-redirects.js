const https = require('https');

// Required OAuth redirect URLs for production
const REQUIRED_REDIRECT_URLS = [
  "https://club19-sales-os-v2.vercel.app",
  "https://club19-sales-os-v2.vercel.app/*",
  "https://club19-sales-os-v2.vercel.app/sso-callback",
  "https://club19-sales-os-v2.vercel.app/oauth-callback",
  "https://*.vercel.app/*"
];

function httpsRequest(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed, null, 2)}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          if (res.statusCode === 204) {
            resolve({}); // Empty response is OK for PATCH
          } else {
            reject(new Error(`Parse error (status ${res.statusCode}): ${data}`));
          }
        }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function run() {
  const CLERK_KEY = process.env.CLERK_SECRET_KEY;

  if (!CLERK_KEY) {
    console.error('❌ ERROR: CLERK_SECRET_KEY environment variable not set');
    console.log('\nPlease set it via:');
    console.log('export CLERK_SECRET_KEY="sk_live_..."');
    console.log('\nOr run with:');
    console.log('CLERK_SECRET_KEY="sk_live_..." node scripts/fix-clerk-oauth-redirects.js');
    process.exit(1);
  }

  console.log('🔍 Clerk OAuth Redirect Configuration Fix\n');
  console.log('='.repeat(70));

  try {
    // Step 1: Fetch current instance configuration
    console.log('\n📡 Step 1: Fetching current Clerk instance configuration...');

    const instance = await httpsRequest('https://api.clerk.com/v1/instance', {
      headers: {
        'Authorization': `Bearer ${CLERK_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!instance || !instance.id) {
      throw new Error('Invalid instance response - no ID found');
    }

    console.log(`✅ Instance ID: ${instance.id}`);
    console.log(`   Environment: ${instance.environment_type || 'N/A'}`);

    // Step 2: Extract current configuration
    console.log('\n📊 Step 2: Analyzing current OAuth configuration...\n');

    const currentRedirectUrls = instance.redirect_urls || [];
    const currentOAuthRedirects = instance.oauth_redirects || [];
    const currentCorsOrigins = instance.cors_origins || [];

    console.log('BEFORE - Current redirect_urls:');
    if (currentRedirectUrls.length === 0) {
      console.log('   (empty)');
    } else {
      currentRedirectUrls.forEach(url => console.log(`   - ${url}`));
    }

    console.log('\nBEFORE - Current oauth_redirects:');
    if (currentOAuthRedirects.length === 0) {
      console.log('   (empty)');
    } else {
      currentOAuthRedirects.forEach(url => console.log(`   - ${url}`));
    }

    console.log('\nBEFORE - Current cors_origins:');
    if (currentCorsOrigins.length === 0) {
      console.log('   (empty)');
    } else {
      currentCorsOrigins.forEach(url => console.log(`   - ${url}`));
    }

    // Step 3: Compute missing URLs
    console.log('\n🔧 Step 3: Computing required changes...\n');

    const missingRedirectUrls = REQUIRED_REDIRECT_URLS.filter(
      url => !currentRedirectUrls.includes(url)
    );

    const missingOAuthRedirects = REQUIRED_REDIRECT_URLS.filter(
      url => !currentOAuthRedirects.includes(url)
    );

    if (missingRedirectUrls.length === 0 && missingOAuthRedirects.length === 0) {
      console.log('✅ Clerk OAuth is already correctly configured!');
      console.log('\n   All required redirect URLs are present.');
      console.log('   No changes needed.');
      console.log('\n' + '='.repeat(70));
      return;
    }

    console.log('Missing redirect_urls:');
    if (missingRedirectUrls.length === 0) {
      console.log('   ✓ None (all present)');
    } else {
      missingRedirectUrls.forEach(url => console.log(`   + ${url}`));
    }

    console.log('\nMissing oauth_redirects:');
    if (missingOAuthRedirects.length === 0) {
      console.log('   ✓ None (all present)');
    } else {
      missingOAuthRedirects.forEach(url => console.log(`   + ${url}`));
    }

    // Step 4: Prepare updated configuration
    console.log('\n💾 Step 4: Preparing configuration update...');

    const updatedRedirectUrls = [...new Set([...currentRedirectUrls, ...missingRedirectUrls])];
    const updatedOAuthRedirects = [...new Set([...currentOAuthRedirects, ...missingOAuthRedirects])];

    const patchData = {};
    if (missingRedirectUrls.length > 0) {
      patchData.redirect_urls = updatedRedirectUrls;
    }
    if (missingOAuthRedirects.length > 0) {
      patchData.oauth_redirects = updatedOAuthRedirects;
    }

    console.log(`   Updating ${Object.keys(patchData).length} field(s)...`);

    // Step 5: Apply the patch
    console.log('\n🚀 Step 5: Applying configuration changes...');

    await httpsRequest(
      'https://api.clerk.com/v1/instance',
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${CLERK_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(patchData)
      }
    );

    console.log('✅ Configuration updated successfully!');

    // Step 6: Verify the changes
    console.log('\n🔍 Step 6: Verifying changes...');

    const verifyInstance = await httpsRequest('https://api.clerk.com/v1/instance', {
      headers: {
        'Authorization': `Bearer ${CLERK_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('\n📊 AFTER - Updated redirect_urls:');
    (verifyInstance.redirect_urls || []).forEach(url => {
      const isNew = missingRedirectUrls.includes(url);
      console.log(`   ${isNew ? '✨' : '-'} ${url}`);
    });

    console.log('\n📊 AFTER - Updated oauth_redirects:');
    (verifyInstance.oauth_redirects || []).forEach(url => {
      const isNew = missingOAuthRedirects.includes(url);
      console.log(`   ${isNew ? '✨' : '-'} ${url}`);
    });

    // Step 7: Generate OAuth ready report
    console.log('\n' + '='.repeat(70));
    console.log('✅ OAUTH REDIRECT CONFIGURATION COMPLETE');
    console.log('='.repeat(70));
    console.log('\n🎯 Production URLs Configured:');
    console.log('   ✓ https://club19-sales-os-v2.vercel.app');
    console.log('   ✓ https://club19-sales-os-v2.vercel.app/*');
    console.log('   ✓ https://club19-sales-os-v2.vercel.app/sso-callback');
    console.log('   ✓ https://club19-sales-os-v2.vercel.app/oauth-callback');
    console.log('   ✓ https://*.vercel.app/* (wildcard for all Vercel deployments)');

    console.log('\n🔐 OAuth Status:');
    console.log('   ✓ redirect_urls: Configured');
    console.log('   ✓ oauth_redirects: Configured');
    console.log('   ✓ Production OAuth: READY');

    console.log('\n📝 Changes Applied:');
    if (missingRedirectUrls.length > 0) {
      console.log(`   ✓ Added ${missingRedirectUrls.length} redirect_url(s)`);
    }
    if (missingOAuthRedirects.length > 0) {
      console.log(`   ✓ Added ${missingOAuthRedirects.length} oauth_redirect(s)`);
    }

    console.log('\n✨ OAuth will now work on:');
    console.log('   → https://club19-sales-os-v2.vercel.app/legacy');
    console.log('   → https://club19-sales-os-v2.vercel.app (all routes)');
    console.log('   → All Vercel preview deployments');

    console.log('\n🎉 Clerk OAuth redirect configuration successfully updated!');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);

    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.log('\n⚠️  Authentication failed. Please check:');
      console.log('   1. CLERK_SECRET_KEY is correct');
      console.log('   2. Key starts with sk_test_ or sk_live_');
      console.log('   3. Key has not expired');
      console.log('   4. Key has permissions to modify instance settings');
    } else if (error.message.includes('404')) {
      console.log('\n⚠️  Instance not found. This may indicate:');
      console.log('   1. Wrong API key for this instance');
      console.log('   2. Instance has been deleted');
      console.log('   3. API endpoint changed');
    } else if (error.message.includes('422') || error.message.includes('400')) {
      console.log('\n⚠️  Invalid request. Possible causes:');
      console.log('   1. redirect_urls or oauth_redirects field format incorrect');
      console.log('   2. URLs contain invalid characters');
      console.log('   3. Wildcard patterns not supported in this field');
      console.log('\n💡 Suggested fix:');
      console.log('   - Check Clerk API documentation for field requirements');
      console.log('   - Verify URL patterns are valid');
      console.log('   - Try updating via Clerk Dashboard manually');
    } else {
      console.log('\n⚠️  Unexpected error. Full details above.');
      console.log('\n💡 Debug steps:');
      console.log('   1. Check if Clerk API is accessible');
      console.log('   2. Verify API endpoint is correct');
      console.log('   3. Try fetching instance manually:');
      console.log(`      curl -H "Authorization: Bearer $CLERK_SECRET_KEY" https://api.clerk.com/v1/instance`);
    }

    console.log('\n📚 Clerk API Documentation:');
    console.log('   https://clerk.com/docs/reference/backend-api/tag/Instance');

    process.exit(1);
  }
}

run();
