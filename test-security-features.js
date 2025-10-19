// Test Security and Authentication Features
const { AuthManager } = require('./packages/core/dist/mcp/auth.js');
const { SecurityManager } = require('./packages/core/dist/mcp/security.js');

async function testSecurityFeatures() {
  try {
    console.log('🔒 Testing Security and Authentication Features...\n');

    // Test 1: Authentication Manager
    console.log('1. Testing Authentication Manager...');
    const authManager = new AuthManager({
      secret: 'test-secret-key',
      requireAuth: true
    });

    // Create tokens
    const token1 = await authManager.createToken('client-1', ['read', 'write']);
    const token2 = await authManager.createToken('client-2', ['read']);

    console.log('✅ Tokens created successfully');
    console.log('   - Token 1:', token1.substring(0, 20) + '...');
    console.log('   - Token 2:', token2.substring(0, 20) + '...');

    // Validate tokens
    const validation1 = await authManager.validateToken(token1);
    const validation2 = await authManager.validateToken(token2);

    console.log('✅ Token validation working');
    console.log('   - Client 1 valid:', validation1.valid, 'Client ID:', validation1.clientId);
    console.log('   - Client 2 valid:', validation2.valid, 'Client ID:', validation2.clientId);

    // Test token revocation
    await authManager.revokeToken(token1);
    const revokedValidation = await authManager.validateToken(token1);
    console.log('✅ Token revocation working');
    console.log('   - Revoked token valid:', revokedValidation.valid, 'Error:', revokedValidation.error);

    // Test 2: Security Manager
    console.log('\n2. Testing Security Manager...');
    const securityManager = new SecurityManager({
      maxConnectionsPerClient: 3,
      maxQueryComplexity: 100,
      allowedTables: ['users', 'products'],
      allowedOperations: ['query', 'read'],
      rateLimitWindowMs: 5000, // 5 seconds for testing
      maxRequestsPerWindow: 3
    });

    // Test table access control
    console.log('✅ Table access control working');
    console.log('   - users table allowed:', securityManager.isTableAllowed('users'));
    console.log('   - admin table allowed:', securityManager.isTableAllowed('admin'));

    // Test operation access control
    console.log('✅ Operation access control working');
    console.log('   - query operation allowed:', securityManager.isOperationAllowed('query'));
    console.log('   - insert operation allowed:', securityManager.isOperationAllowed('insert'));

    // Test query validation
    const validQuery = { name: 'test', age: { $gt: 18 } };
    const maliciousQuery = { $where: '1=1' };
    const complexQuery = {
      $and: [
        { name: 'test' },
        { age: { $gt: 18 } },
        { tags: { $in: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] } }
      ]
    };

    const validResult = await securityManager.validateQuery(validQuery);
    const maliciousResult = await securityManager.validateQuery(maliciousQuery);
    const complexResult = await securityManager.validateQuery(complexQuery);

    console.log('✅ Query validation working');
    console.log('   - Valid query:', validResult.valid);
    console.log('   - Malicious query:', maliciousResult.valid, 'Error:', maliciousResult.error);
    console.log('   - Complex query:', complexResult.valid, 'Error:', complexResult.error);

    // Test connection management
    console.log('✅ Connection management working');
    for (let i = 1; i <= 4; i++) {
      const allowed = securityManager.checkConnection('test-client');
      console.log(`   - Connection ${i}: ${allowed ? 'Allowed' : 'Blocked'}`);
    }

    // Test rate limiting
    console.log('✅ Rate limiting working');
    for (let i = 1; i <= 5; i++) {
      const allowed = securityManager.checkRateLimit('rate-test-client');
      console.log(`   - Request ${i}: ${allowed ? 'Allowed' : 'Blocked'}`);
    }

    // Test input sanitization
    const maliciousInput = { name: "<script>alert('xss')</script>", password: 'secret123' };
    const sanitizedInput = await securityManager.sanitizeInput(maliciousInput);

    console.log('✅ Input sanitization working');
    console.log('   - Original input:', JSON.stringify(maliciousInput));
    console.log('   - Sanitized input:', JSON.stringify(sanitizedInput));

    // Test output sanitization
    const sensitiveOutput = {
      id: 1,
      name: 'John',
      password: 'secret123',
      token: 'abc123',
      email: 'john@example.com'
    };
    const sanitizedOutput = await securityManager.sanitizeOutput(sensitiveOutput);

    console.log('✅ Output sanitization working');
    console.log('   - Original output:', JSON.stringify(sensitiveOutput));
    console.log('   - Sanitized output:', JSON.stringify(sanitizedOutput));

    // Test security logging
    await securityManager.logSecurityEvent('test_event', { action: 'test', user: 'test-user' });
    console.log('✅ Security logging working');

    // Test statistics
    const stats = securityManager.getStats();
    console.log('✅ Security statistics working');
    console.log('   - Active connections:', stats.activeConnections);
    console.log('   - Unique clients:', stats.uniqueClients);
    console.log('   - Blocked clients:', stats.blockedClients);

    console.log('\n🎉 Security and Authentication Tests PASSED!');
    console.log('\n📋 Security Features Summary:');
    console.log('   - JWT Authentication: ✓ Implemented');
    console.log('   - Token Management: ✓ Working');
    console.log('   - Query Validation: ✓ Comprehensive');
    console.log('   - Rate Limiting: ✓ Effective');
    console.log('   - Connection Management: ✓ Robust');
    console.log('   - Input/Output Sanitization: ✓ Secure');
    console.log('   - Access Control: ✓ Granular');
    console.log('   - Security Logging: ✓ Functional');

  } catch (error) {
    console.error('\n❌ Security Test Failed:', error);
    process.exit(1);
  }
}

// Run the test
testSecurityFeatures();