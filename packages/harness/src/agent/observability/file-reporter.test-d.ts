import { describe, expectTypeOf, test } from 'vitest';
import {
  createFileReporter,
  type FileReporter,
  type FileReporterOptions,
} from './file-reporter';

describe('createFileReporter types', () => {
  test('supports immediate and failure-only reporting modes', () => {
    const immediateOptions = {
      dir: '.harness-observability',
      failOnly: false,
    } satisfies FileReporterOptions;
    const failureOnlyOptions = {
      dir: '.harness-observability',
      failOnly: true,
      fileName: 'failures.jsonl',
    } satisfies FileReporterOptions;

    expectTypeOf(
      createFileReporter(immediateOptions),
    ).toEqualTypeOf<FileReporter>();
    expectTypeOf(
      createFileReporter(failureOnlyOptions),
    ).toEqualTypeOf<FileReporter>();
  });
});
