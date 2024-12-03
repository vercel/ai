import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateAuthToken,
  _resetAuthInstance,
} from './google-vertex-auth-google-auth-library';
import { GoogleAuth } from 'google-auth-library';

vi.mock('google-auth-library', () => {
  return {
    GoogleAuth: vi.fn().mockImplementation(() => {
      return {
        getClient: vi.fn().mockResolvedValue({
          getAccessToken: vi.fn().mockResolvedValue({ token: 'mocked-token' }),
        }),
      };
    }),
  };
});

describe('generateAuthToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetAuthInstance();
  });

  it('should generate a valid auth token', async () => {
    const token = await generateAuthToken();
    expect(token).toBe('mocked-token');
  });

  it('should return null if no token is received', async () => {
    // Reset the mock completely
    vi.mocked(GoogleAuth).mockReset();

    // Create a new mock implementation
    vi.mocked(GoogleAuth).mockImplementation(
      () =>
        ({
          getClient: vi.fn().mockResolvedValue({
            getAccessToken: vi.fn().mockResolvedValue({ token: null }),
          }),
          isGCE: vi.fn(),
        } as unknown as GoogleAuth),
    );

    const token = await generateAuthToken();
    expect(token).toBeNull();
  });

  it('should create new auth instance with provided options', async () => {
    const options = { keyFile: 'test-key.json' };
    await generateAuthToken(options);

    expect(GoogleAuth).toHaveBeenCalledWith({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      keyFile: 'test-key.json',
    });
  });
});
