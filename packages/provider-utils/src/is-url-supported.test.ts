import { isUrlSupported } from './is-url-supported';

describe('isUrlSupported', () => {
  describe('when the model does not support any URLs', () => {
    it('should return false', async () => {
      expect(
        await isUrlSupported({
          mediaType: 'text/plain',
          url: 'https://example.com',
          supportedUrls: {},
        }),
      ).toBe(false);
    });
  });
});
