const colors = require('colors'); // npm install colors

class TestResult {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.total = 0;
    this.results = [];
  }

  addResult(testName, passed, error = null) {
    this.total++;
    if (passed) {
      this.passed++;
      this.results.push({ testName, passed: true });
    } else {
      this.failed++;
      this.results.push({ testName, passed: false, error });
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(80));
    console.log('TEST SUMMARY'.bold);
    console.log('='.repeat(80));
    console.log(`Total Tests: ${this.total}`);
    console.log(`Passed: ${this.passed}`.green);
    console.log(`Failed: ${this.failed}`.red);
    console.log(`Success Rate: ${((this.passed / this.total) * 100).toFixed(2)}%`);
    console.log('='.repeat(80));
    
    if (this.failed > 0) {
      console.log('\nFAILED TESTS:'.red.bold);
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  ❌ ${r.testName}`.red);
          if (r.error) {
            console.log(`     ${r.error.message}`.gray);
          }
        });
    }
  }
}

/**
 * Assert helper function
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

/**
 * Assert equality
 */
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${expected}, but got ${actual}`
    );
  }
}

/**
 * Assert array contains value
 */
function assertIncludes(array, value, message) {
  if (!array.includes(value)) {
    throw new Error(
      message || `Expected array to include ${value}`
    );
  }
}

/**
 * Assert object has property
 */
function assertHasProperty(obj, property, message) {
  if (!obj.hasOwnProperty(property)) {
    throw new Error(
      message || `Expected object to have property ${property}`
    );
  }
}

/**
 * Run a single test
 */
async function runTest(testName, testFn, testResult) {
  process.stdout.write(`🧪 ${testName}... `);
  
  try {
    await testFn();
    console.log('✅ PASSED'.green);
    testResult.addResult(testName, true);
  } catch (error) {
    console.log('❌ FAILED'.red);
    console.log(`   Error: ${error.message}`.red);
    testResult.addResult(testName, false, error);
  }
}

/**
 * Run test suite
 */
async function runTestSuite(suiteName, tests, testResult) {
  console.log('\n' + '─'.repeat(80));
  console.log(`📦 ${suiteName}`.bold.cyan);
  console.log('─'.repeat(80));
  
  for (const test of tests) {
    await runTest(test.name, test.fn, testResult);
  }
}

/**
 * Wait for a specified time
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Deep clone object
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

module.exports = {
  TestResult,
  assert,
  assertEqual,
  assertIncludes,
  assertHasProperty,
  runTest,
  runTestSuite,
  wait,
  deepClone
};
