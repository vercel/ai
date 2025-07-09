import { safeParseJSON } from '@ai-sdk/provider-utils';
import { assemblyaiErrorDataSchema } from './assemblyai-error';

describe('assemblyaiErrorDataSchema', () => {
<<<<<<< HEAD
  it('should parse AssemblyAI resource exhausted error', () => {
=======
  it('should parse AssemblyAI resource exhausted error', async () => {
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
    const error = `
{"error":{"message":"{\\n  \\"error\\": {\\n    \\"code\\": 429,\\n    \\"message\\": \\"Resource has been exhausted (e.g. check quota).\\",\\n    \\"status\\": \\"RESOURCE_EXHAUSTED\\"\\n  }\\n}\\n","code":429}}
`;

<<<<<<< HEAD
    const result = safeParseJSON({
=======
    const result = await safeParseJSON({
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
      text: error,
      schema: assemblyaiErrorDataSchema,
    });

    expect(result).toStrictEqual({
      success: true,
      value: {
        error: {
          message:
            '{\n  "error": {\n    "code": 429,\n    "message": "Resource has been exhausted (e.g. check quota).",\n    "status": "RESOURCE_EXHAUSTED"\n  }\n}\n',
          code: 429,
        },
      },
      rawValue: {
        error: {
          message:
            '{\n  "error": {\n    "code": 429,\n    "message": "Resource has been exhausted (e.g. check quota).",\n    "status": "RESOURCE_EXHAUSTED"\n  }\n}\n',
          code: 429,
        },
      },
    });
  });
});
