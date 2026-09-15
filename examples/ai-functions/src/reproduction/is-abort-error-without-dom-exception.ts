import { isAbortError } from '@ai-sdk/provider-utils';
import assert from 'node:assert/strict';

async function main() {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'DOMException',
  );

  assert.ok(
    originalDescriptor,
    'DOMException must exist to simulate this runtime',
  );
  assert.ok(
    originalDescriptor.configurable,
    'DOMException must be configurable to simulate this runtime',
  );

  Object.defineProperty(globalThis, 'DOMException', {
    ...originalDescriptor,
    value: undefined,
  });

  try {
    // The exact same-realm TypeError from the issue does not evaluate the
    // DOMException branch because it is already an Error.
    assert.equal(isAbortError(new TypeError('some unrelated failure')), false);

    let result: boolean | undefined;
    let thrown: unknown;

    try {
      // JavaScript permits throwing non-Error values, and isAbortError accepts
      // unknown. This reaches the DOMException branch.
      result = isAbortError({
        name: 'SomeUnrelatedFailure',
        message: 'some unrelated failure',
      });
    } catch (error) {
      thrown = error;
    }

    if (thrown !== undefined) {
      const description =
        thrown instanceof Error
          ? `${thrown.name}: ${thrown.message}`
          : String(thrown);

      console.error(
        `ISSUE_20797_REPRODUCED: isAbortError threw instead of returning false when DOMException was not a constructor: ${description}`,
      );
      process.exitCode = 1;
      return;
    }

    assert.equal(
      result,
      false,
      'isAbortError must return false for an unrelated throwable',
    );
  } finally {
    Object.defineProperty(globalThis, 'DOMException', originalDescriptor);
  }
}

main().catch(error => {
  console.error('Reproduction harness failed:', error);
  process.exitCode = 2;
});
