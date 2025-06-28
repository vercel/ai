import { streamText } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import 'dotenv/config';

const VALID_OIDC_TOKEN =
  process.env.VERCEL_OIDC_TOKEN || 'valid-oidc-token-12345';
const VALID_API_KEY =
  process.env.AI_GATEWAY_API_KEY || 'gw_valid_api_key_12345';
const INVALID_OIDC_TOKEN = 'invalid-oidc-token';
const INVALID_API_KEY = 'invalid-api-key';

const testScenarios = [
  {
    name: 'no auth at all',
    description: 'No OIDC token or API key provided',
    setupEnv: () => {
      delete process.env.VERCEL_OIDC_TOKEN;
      delete process.env.AI_GATEWAY_API_KEY;
    },
    expectSuccess: false,
  },
  {
    name: 'valid oidc, invalid api key',
    description:
      'Valid OIDC in env, but invalid API key takes precedence and fails',
    setupEnv: () => {
      process.env.VERCEL_OIDC_TOKEN = VALID_OIDC_TOKEN;
      process.env.AI_GATEWAY_API_KEY = INVALID_API_KEY;
    },
    expectSuccess: false, // Invalid API key is validated and rejected
  },
  {
    name: 'invalid oidc, valid api key',
    description: 'Invalid OIDC, but valid API key should work',
    setupEnv: () => {
      process.env.VERCEL_OIDC_TOKEN = INVALID_OIDC_TOKEN;
      process.env.AI_GATEWAY_API_KEY = VALID_API_KEY;
    },
    expectSuccess: true,
    expectedAuthMethod: 'api-key', // Should use API key
  },
  {
    name: 'no oidc, invalid api key',
    description: 'No OIDC, invalid API key should fail validation',
    setupEnv: () => {
      delete process.env.VERCEL_OIDC_TOKEN;
      process.env.AI_GATEWAY_API_KEY = INVALID_API_KEY;
    },
    expectSuccess: false, // Invalid API key is validated and rejected
  },
  {
    name: 'no oidc, valid api key',
    description: 'Valid API key in environment should work',
    setupEnv: () => {
      delete process.env.VERCEL_OIDC_TOKEN;
      process.env.AI_GATEWAY_API_KEY = VALID_API_KEY;
    },
    expectSuccess: true,
    expectedAuthMethod: 'api-key', // Should use API key
  },
  {
    name: 'valid oidc, valid api key',
    description: 'Both valid credentials - API key should take precedence',
    setupEnv: () => {
      process.env.VERCEL_OIDC_TOKEN = VALID_OIDC_TOKEN;
      process.env.AI_GATEWAY_API_KEY = VALID_API_KEY;
    },
    expectSuccess: true,
    expectedAuthMethod: 'api-key', // Should use API key due to precedence
  },
  {
    name: 'valid oidc, no api key',
    description: 'Valid OIDC token should work when no API key provided',
    setupEnv: () => {
      process.env.VERCEL_OIDC_TOKEN = VALID_OIDC_TOKEN;
      delete process.env.AI_GATEWAY_API_KEY;
    },
    expectSuccess: true,
    expectedAuthMethod: 'oidc', // Should use OIDC when no API key
  },
  {
    name: 'invalid oidc, no api key',
    description: 'Invalid OIDC and no API key should fail',
    setupEnv: () => {
      process.env.VERCEL_OIDC_TOKEN = INVALID_OIDC_TOKEN;
      delete process.env.AI_GATEWAY_API_KEY;
    },
    expectSuccess: false,
  },
  {
    name: 'invalid oidc, invalid api key',
    description: 'Invalid API key fails validation, OIDC not attempted',
    setupEnv: () => {
      process.env.VERCEL_OIDC_TOKEN = INVALID_OIDC_TOKEN;
      process.env.AI_GATEWAY_API_KEY = INVALID_API_KEY;
    },
    expectSuccess: false, // Invalid API key is validated and rejected
  },
];

async function testAuthenticationScenario(
  scenario: (typeof testScenarios)[0] & { expectedAuthMethod?: string },
) {
  try {
    console.log('\n' + '='.repeat(60));
    console.log(`Testing: ${scenario.name}`);
    console.log(`Description: ${scenario.description}`);
    console.log(
      'Expected result:',
      scenario.expectSuccess ? 'SUCCESS' : 'FAILURE',
    );

    // Safely set up environment
    try {
      scenario.setupEnv();
    } catch (setupError) {
      console.log('❌ Environment setup failed:', setupError);
      return { success: false, error: setupError, responseText: null };
    }

    console.log('\nEnvironment setup:');
    console.log(
      '  VERCEL_OIDC_TOKEN:',
      process.env.VERCEL_OIDC_TOKEN ? '✓ Set' : '✗ Not set',
    );
    console.log(
      '  AI_GATEWAY_API_KEY:',
      process.env.AI_GATEWAY_API_KEY ? '✓ Set' : '✗ Not set',
    );

    try {
      console.log('\nAttempting to stream text...');

      // Create a promise that can track both streaming success/failure and onError callback
      // Use Promise.race with proper timeout cleanup
      let timeoutHandle: NodeJS.Timeout | null = null;

      const streamingResult = await Promise.race([
        new Promise<{
          success: boolean;
          error: any;
          responseText: string | null;
          usage?: any;
          finishReason?: any;
          detectedAuthMethod?: string;
        }>(resolve => {
          let callbackErrorOccurred = false;
          let callbackError: any = null;

          const result = streamText({
            model: gateway('openai/gpt-4'),
            prompt: `Test authentication scenario: ${scenario.name}. Respond with a brief confirmation.`,
            onError: error => {
              console.log('\n❌ onError callback triggered');
              // console.log('Callback Error:', JSON.stringify(error, null, 2));
              console.log('Status: ❌ FAILURE (via onError)');

              callbackErrorOccurred = true;
              callbackError = error;

              // Clear timeout since we're resolving
              if (timeoutHandle) {
                clearTimeout(timeoutHandle);
                timeoutHandle = null;
              }

              // Resolve immediately when onError is triggered
              resolve({
                success: false,
                error: error,
                responseText: null,
              });
            },
          });

          console.log('✓ Request initiated successfully');

          // Handle the streaming in an async function
          (async () => {
            let responseText = '';

            try {
              // Check if callback error already occurred before starting stream consumption
              if (callbackErrorOccurred) {
                return; // onError already resolved the promise
              }

              for await (const textPart of result.textStream) {
                // Double-check during streaming in case onError is triggered mid-stream
                if (callbackErrorOccurred) {
                  return; // onError already resolved the promise
                }

                responseText += textPart;
                process.stdout.write(textPart);
              }

              // Only proceed if no callback error occurred
              if (!callbackErrorOccurred) {
                const usage = await result.usage;
                const finishReason = await result.finishReason;

                console.log('\n✓ Stream completed successfully');
                console.log('Token usage:', usage);
                console.log('Finish reason:', finishReason);

                // Determine which authentication method was likely used
                const hasApiKey = !!process.env.AI_GATEWAY_API_KEY;
                const hasOidcToken = !!process.env.VERCEL_OIDC_TOKEN;
                let detectedAuthMethod = 'unknown';

                if (hasApiKey) {
                  detectedAuthMethod = 'api-key'; // API key takes precedence
                } else if (hasOidcToken) {
                  detectedAuthMethod = 'oidc';
                }

                console.log(
                  `🔐 Authentication method used: ${detectedAuthMethod}`,
                );
                console.log(
                  `📋 Available credentials: API_KEY=${hasApiKey ? '✓' : '✗'}, OIDC_TOKEN=${hasOidcToken ? '✓' : '✗'}`,
                );
                console.log('Status: ✅ SUCCESS');

                // Clear timeout since we're resolving successfully
                if (timeoutHandle) {
                  clearTimeout(timeoutHandle);
                  timeoutHandle = null;
                }

                resolve({
                  success: true,
                  error: null,
                  responseText,
                  usage,
                  finishReason,
                  detectedAuthMethod,
                });
              }
            } catch (streamError) {
              // Only handle stream errors if callback error hasn't already been handled
              if (!callbackErrorOccurred) {
                console.log('\n❌ Streaming failed');
                console.log(
                  'Stream Error:',
                  streamError instanceof Error
                    ? streamError.message
                    : String(streamError),
                );
                console.log('Status: ❌ FAILURE (via stream)');

                // Clear timeout since we're resolving with error
                if (timeoutHandle) {
                  clearTimeout(timeoutHandle);
                  timeoutHandle = null;
                }

                resolve({
                  success: false,
                  error: streamError,
                  responseText: null,
                });
              }
            }
          })().catch(asyncError => {
            // Handle any errors in the async function itself
            if (!callbackErrorOccurred) {
              console.log('\n❌ Async streaming handler failed');
              console.log(
                'Async Error:',
                asyncError instanceof Error
                  ? asyncError.message
                  : String(asyncError),
              );
              console.log('Status: ❌ FAILURE (via async handler)');

              // Clear timeout since we're resolving with error
              if (timeoutHandle) {
                clearTimeout(timeoutHandle);
                timeoutHandle = null;
              }

              resolve({
                success: false,
                error: asyncError,
                responseText: null,
              });
            }
          });
        }),

        // Add a timeout promise (30 seconds)
        new Promise<{
          success: boolean;
          error: any;
          responseText: string | null;
          detectedAuthMethod?: string;
        }>(resolve => {
          timeoutHandle = setTimeout(() => {
            console.log('\n⏰ Test timed out after 30 seconds');
            console.log('Status: ❌ FAILURE (timeout)');
            timeoutHandle = null; // Clear the reference
            resolve({
              success: false,
              error: new Error('Test timed out after 30 seconds'),
              responseText: null,
            });
          }, 30000); // 30 second timeout
        }),
      ]);

      // Ensure timeout is cleaned up after Promise.race resolves
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }

      return streamingResult;
    } catch (error) {
      console.log('\n❌ Request initiation failed');
      console.log(
        'Error:',
        error instanceof Error ? error.message : String(error),
      );
      console.log('Status: ❌ FAILURE');

      return { success: false, error, responseText: null };
    }
  } catch (outerError) {
    // Catch any other unexpected errors to prevent stopping the test suite
    console.log('\n💥 Test scenario encountered unexpected error:');
    console.log(
      outerError instanceof Error ? outerError.message : String(outerError),
    );
    console.log('Status: ❌ CRITICAL FAILURE');

    return { success: false, error: outerError, responseText: null };
  }
}

async function runAllScenarios() {
  console.log('🧪 AI Gateway Authentication Permutation Testing');
  console.log(
    'Testing all combinations of OIDC token and API key authentication',
  );
  console.log(`\nRunning ${testScenarios.length} test scenarios...\n`);

  const results: Array<{
    scenario: string;
    expected: boolean;
    actual: boolean;
    match: boolean;
    authMethodMatch?: boolean;
    expectedAuthMethod?: string;
    detectedAuthMethod?: string;
  }> = [];

  for (let i = 0; i < testScenarios.length; i++) {
    try {
      const scenario = testScenarios[i];
      console.log(
        `\n[${i + 1}/${testScenarios.length}] Starting test: ${scenario.name}`,
      );

      let result;

      try {
        console.log(`🔄 Executing test scenario...`);
        result = await testAuthenticationScenario(scenario);
        console.log(`✅ Test scenario execution completed`);
      } catch (testError) {
        // Catch any errors that somehow escape the test function
        console.log(
          `\n💥 Critical error in test "${scenario.name}":`,
          testError,
        );
        console.log('📋 Error details:', {
          name: testError instanceof Error ? testError.name : 'Unknown',
          message:
            testError instanceof Error ? testError.message : String(testError),
          stack:
            testError instanceof Error
              ? testError.stack?.split('\n').slice(0, 3).join('\n')
              : 'No stack trace',
        });

        result = {
          success: false,
          error: testError,
          responseText: null,
        };

        console.log('🔄 Continuing to next test despite error...');
      }

      const successMatch = result.success === scenario.expectSuccess;

      // Check authentication method for successful cases
      let authMethodMatch = true;
      let authMethodMessage = '';

      if (
        scenario.expectedAuthMethod &&
        result.success &&
        result.detectedAuthMethod
      ) {
        authMethodMatch =
          result.detectedAuthMethod === scenario.expectedAuthMethod;
        authMethodMessage = authMethodMatch
          ? ` (auth: ${result.detectedAuthMethod} ✓)`
          : ` (auth: expected ${scenario.expectedAuthMethod}, got ${result.detectedAuthMethod} ❌)`;
      }

      const match = successMatch && authMethodMatch;

      results.push({
        scenario: scenario.name,
        expected: scenario.expectSuccess,
        actual: result.success,
        match,
        authMethodMatch,
        expectedAuthMethod: scenario.expectedAuthMethod,
        detectedAuthMethod: result.detectedAuthMethod,
      });

      // Log completion status for this test
      const statusIcon = match ? '✅' : '❌';
      const expectedStr = scenario.expectSuccess ? 'SUCCESS' : 'FAILURE';
      const actualStr = result.success ? 'SUCCESS' : 'FAILURE';
      console.log(
        `\n${statusIcon} Test ${i + 1} completed: expected ${expectedStr}, got ${actualStr}${authMethodMessage}`,
      );

      if (i < testScenarios.length - 1) {
        console.log('⏳ Moving to next test...');
        console.log(
          `📊 Current progress: ${i + 1}/${testScenarios.length} tests completed`,
        );
        // Small delay between tests to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (loopError) {
      console.log(
        `\n🚨 CRITICAL: Error in main test loop at iteration ${i + 1}:`,
        loopError,
      );
      console.log('🔄 Attempting to continue with next test...');

      // Still try to record this as a failed test
      const scenario = testScenarios[i] || { name: `Test ${i + 1}` };
      results.push({
        scenario: scenario.name,
        expected: false,
        actual: false,
        match: false,
      });

      // Continue to next iteration
      continue;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));

  const totalTests = results.length;
  const passedTests = results.filter(r => r.match).length;
  const failedTests = totalTests - passedTests;

  console.log(`Total scenarios tested: ${totalTests}`);
  console.log(`Scenarios matching expectations: ${passedTests}`);
  console.log(`Scenarios not matching expectations: ${failedTests}`);

  if (failedTests > 0) {
    console.log('\n❌ Failed scenarios:');
    results
      .filter(r => !r.match)
      .forEach(r => {
        const baseMessage = `  • ${r.scenario}: expected ${r.expected ? 'SUCCESS' : 'FAILURE'}, got ${r.actual ? 'SUCCESS' : 'FAILURE'}`;

        // Add auth method details if relevant
        if (
          r.expectedAuthMethod &&
          r.detectedAuthMethod &&
          !r.authMethodMatch
        ) {
          console.log(
            `${baseMessage} (auth: expected ${r.expectedAuthMethod}, got ${r.detectedAuthMethod})`,
          );
        } else {
          console.log(baseMessage);
        }
      });
  }

  console.log('\n📋 Detailed Results:');
  results.forEach(r => {
    const status = r.match ? '✅' : '❌';
    const expectedStr = r.expected ? 'SUCCESS' : 'FAILURE';
    const actualStr = r.actual ? 'SUCCESS' : 'FAILURE';

    let authInfo = '';
    if (r.expectedAuthMethod && r.detectedAuthMethod) {
      authInfo = ` (auth: ${r.detectedAuthMethod}${r.authMethodMatch ? ' ✓' : ` ≠ ${r.expectedAuthMethod} ❌`})`;
    } else if (r.detectedAuthMethod && r.actual) {
      authInfo = ` (auth: ${r.detectedAuthMethod})`;
    }

    console.log(
      `  ${status} ${r.scenario}: expected ${expectedStr}, got ${actualStr}${authInfo}`,
    );
  });

  console.log('\n' + '='.repeat(60));
  console.log('🏁 Testing complete!');

  if (failedTests === 0) {
    console.log('🎉 All authentication scenarios behaved as expected!');
  } else {
    console.log(
      '⚠️  Some scenarios did not match expectations. This may indicate:',
    );
    console.log('   - Authentication logic differences from expectations');
    console.log('   - Server-side validation behavior');
    console.log('   - Network or configuration issues');
  }
}

async function runSingleScenario(scenarioName?: string) {
  if (!scenarioName) {
    console.log('Available scenarios:');
    testScenarios.forEach((scenario, index) => {
      console.log(`  ${index + 1}. ${scenario.name} - ${scenario.description}`);
    });
    console.log('\nUsage: node gateway-auth.js [scenario-name]');
    console.log('   or: node gateway-auth.js all');
    return;
  }

  if (scenarioName === 'all') {
    try {
      await runAllScenarios();
    } catch (error) {
      console.error('\n💥 Test suite encountered a critical error:', error);
      console.log(
        '\n⚠️  Some tests may not have completed. This could indicate:',
      );
      console.log('   - Network connectivity issues');
      console.log('   - Gateway service unavailability');
      console.log('   - Critical authentication system failure');
      process.exit(1);
    }
    return;
  }

  const scenario = testScenarios.find(s => s.name === scenarioName);
  if (!scenario) {
    console.error(`❌ Scenario "${scenarioName}" not found.`);
    console.log(
      'Available scenarios:',
      testScenarios.map(s => s.name).join(', '),
    );
    return;
  }

  try {
    await testAuthenticationScenario(scenario);
  } catch (error) {
    console.error(
      `\n💥 Test "${scenario.name}" encountered a critical error:`,
      error,
    );
    console.log(
      '⚠️  This test could not be completed due to an unexpected failure.',
    );
  }
}

async function main() {
  const scenarioArg = process.argv[2];

  console.log('🔐 AI Gateway Authentication Testing');
  console.log(
    'This script tests different combinations of authentication methods.\n',
  );

  if (!scenarioArg) {
    console.log(
      'Run with "all" to test all scenarios, or specify a scenario name:',
    );
    await runSingleScenario();
  } else {
    await runSingleScenario(scenarioArg);
  }
}

process.on('SIGINT', () => {
  console.log('\n\n👋 Testing interrupted by user');
  process.exit(0);
});

process.on('unhandledRejection', error => {
  console.error('\n❌ Unhandled promise rejection:', error);
  process.exit(1);
});

main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
