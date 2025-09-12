import { describe, it, expect } from 'vitest';

import { withUserAgentSuffix } from './with-user-agent-suffix';

describe('withUserAgentSuffix', () => {
  it('should create a new user-agent header when no existing user-agent exists', () => {
    const headers = {
      'content-type': 'application/json',
      'authorization': 'Bearer token123',
    };

    const result = withUserAgentSuffix(headers, 'ai-sdk/0.0.0-test', 'provider/test-openai');

    expect(result['user-agent']).toBe('ai-sdk/0.0.0-test provider/test-openai');
    expect(result['content-type']).toBe('application/json');
    expect(result['authorization']).toBe('Bearer token123');
  });

  it('should append suffix parts to existing user-agent header', () => {
    const headers = {
      'user-agent': 'TestApp/0.0.0-test',
      'accept': 'application/json',
    };

    const result = withUserAgentSuffix(headers, 'ai-sdk/0.0.0-test', 'provider/test-anthropic');

    expect(result['user-agent']).toBe('TestApp/0.0.0-test ai-sdk/0.0.0-test provider/test-anthropic');
    expect(result['accept']).toBe('application/json');
  });
});