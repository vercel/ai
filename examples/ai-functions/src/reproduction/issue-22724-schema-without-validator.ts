import assert from 'node:assert/strict';
import {
  asSchema,
  jsonSchema,
  safeValidateTypes,
} from '@ai-sdk/provider-utils';

async function main() {
  const original = jsonSchema<number>({ type: 'number' });
  const { validate, ...withoutValidator } = original;

  assert.equal(validate, undefined);
  assert.equal(asSchema(original), original);
  assert.equal(
    (await safeValidateTypes({ value: 42, schema: original })).success,
    true,
  );

  let converted;
  let asSchemaError: unknown;
  try {
    converted = asSchema(withoutValidator);
  } catch (error) {
    asSchemaError = error;
  }

  let validationResult;
  let validationError: unknown;
  try {
    validationResult = await safeValidateTypes({
      value: 42,
      schema: withoutValidator,
    });
  } catch (error) {
    validationError = error;
  }

  const isReportedError = (error: unknown) =>
    error instanceof TypeError && error.message === 'schema is not a function';

  if (isReportedError(asSchemaError) && isReportedError(validationError)) {
    throw new Error(
      'ISSUE_22724_REPRODUCED: asSchema and safeValidateTypes reject a valid Schema when the optional validate property is omitted',
    );
  }

  if (asSchemaError != null) {
    throw asSchemaError;
  }
  if (validationError != null) {
    throw validationError;
  }

  assert.equal(converted, withoutValidator);
  assert.equal(validationResult?.success, true);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
