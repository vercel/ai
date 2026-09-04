import { describe, expect, it } from 'vitest';
import { gmicloudErrorStructure } from './gmicloud-error';

// Bodies are verbatim captures from api.gmi-serving.com/v1/chat/completions
// (2026-08). Each previously surfaced only the edge banner in `error.message`.

const MAX_TOKENS_BODY =
  '{"error":{"message":"Backend request failed with status 400","type":"backend_error","code":400,"details":"{\\"error\\":{\\"type\\":\\"invalid_request_error\\",\\"code\\":\\"400001\\",\\"message\\":\\"The request is invalid: Invalid max_tokens value, the valid range of max_tokens is [1, 393216]. Please check the request body, required fields, and request format.\\",\\"message_zh\\":\\"请求不合法：Invalid max_tokens value, the valid range of max_tokens is [1, 393216]，请检查请求体、必填字段及请求格式是否正确。\\",\\"source\\":\\"client\\",\\"request_id\\":\\"6d6429ae-0ee8-49c1-9308-cbd2e2889b45\\"}}"}}';

const THINKING_TOOL_CHOICE_BODY =
  '{"error":{"message":"Backend request failed with status 400","type":"backend_error","code":400,"details":"{\\"error\\":{\\"type\\":\\"invalid_request_error\\",\\"code\\":\\"400001\\",\\"message\\":\\"The request is invalid: Thinking mode does not support this tool_choice. Please check the request body, required fields, and request format.\\",\\"message_zh\\":\\"请求不合法：Thinking mode does not support this tool_choice，请检查请求体、必填字段及请求格式是否正确。\\",\\"source\\":\\"client\\",\\"request_id\\":\\"42068987-101f-4872-b45c-ca3ea683886a\\"}}"}}';

const IMAGE_INPUT_BODY =
  '{"error":{"message":"Backend request failed with status 400","type":"backend_error","code":400,"details":"{\\"error\\":{\\"type\\":\\"invalid_request_error\\",\\"code\\":\\"400001\\",\\"message\\":\\"The request is invalid: Failed to deserialize the JSON body into the target type: messages[0]: unknown variant `image_url`, expected `text` at line 1 column 265. Please check the request body, required fields, and request format.\\",\\"message_zh\\":\\"请求不合法：Failed to deserialize the JSON body into the target type: messages[0]: unknown variant `image_url`, expected `text` at line 1 column 265，请检查请求体、必填字段及请求格式是否正确。\\",\\"source\\":\\"client\\",\\"request_id\\":\\"266609a9-b5f3-4e94-9f11-f61b5904c1e3\\"}}"}}';

function messageFromBody(body: string): string {
  const parsed = gmicloudErrorStructure.errorSchema.parse(JSON.parse(body));
  return gmicloudErrorStructure.errorToMessage(parsed);
}

describe('gmicloudErrorStructure', () => {
  it('unwraps the engine diagnostic from error.details (max_tokens)', () => {
    expect(messageFromBody(MAX_TOKENS_BODY)).toBe(
      'The request is invalid: Invalid max_tokens value, the valid range of max_tokens is [1, 393216]. Please check the request body, required fields, and request format.',
    );
  });

  it('unwraps the engine diagnostic from error.details (thinking tool_choice)', () => {
    expect(messageFromBody(THINKING_TOOL_CHOICE_BODY)).toBe(
      'The request is invalid: Thinking mode does not support this tool_choice. Please check the request body, required fields, and request format.',
    );
  });

  it('unwraps the engine diagnostic from error.details (image input)', () => {
    expect(messageFromBody(IMAGE_INPUT_BODY)).toBe(
      'The request is invalid: Failed to deserialize the JSON body into the target type: messages[0]: unknown variant `image_url`, expected `text` at line 1 column 265. Please check the request body, required fields, and request format.',
    );
  });

  it('falls back to the outer message when details is absent', () => {
    expect(
      gmicloudErrorStructure.errorToMessage(
        gmicloudErrorStructure.errorSchema.parse({
          error: { message: 'Backend request failed with status 400' },
        }),
      ),
    ).toBe('Backend request failed with status 400');
  });

  it('falls back to the outer message when details is not JSON', () => {
    expect(
      gmicloudErrorStructure.errorToMessage(
        gmicloudErrorStructure.errorSchema.parse({
          error: { message: 'banner', details: '<html>nginx</html>' },
        }),
      ),
    ).toBe('banner');
  });

  it('falls back to the outer message when details has no inner message', () => {
    expect(
      gmicloudErrorStructure.errorToMessage(
        gmicloudErrorStructure.errorSchema.parse({
          error: { message: 'banner', details: '{"error":{"code":"500"}}' },
        }),
      ),
    ).toBe('banner');
  });

  it('rejects GMI’s plain-text 404 body, deferring to status text', () => {
    expect(
      gmicloudErrorStructure.errorSchema.safeParse(
        'No matching target server found for model foo',
      ).success,
    ).toBe(false);
  });
});
