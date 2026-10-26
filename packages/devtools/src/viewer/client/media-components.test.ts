import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MediaAwareValue } from './components/shared-components';
import { MessageBubble } from './components/message-components';

describe('MediaAwareValue', () => {
  it('renders inline image previews and retains the JSON value', () => {
    const html = renderToStaticMarkup(
      createElement(MediaAwareValue, {
        data: {
          type: 'file',
          filename: 'screenshot.png',
          mediaType: 'image/png',
          data: { type: 'data', data: 'iVBORw==' },
        },
      }),
    );

    expect(html).toContain('alt="screenshot.png"');
    expect(html).toContain('src="data:image/png;base64,iVBORw=="');
    expect(html).toContain('&quot;mediaType&quot;: &quot;image/png&quot;');
  });

  it('requires an explicit action before loading remote media', () => {
    const html = renderToStaticMarkup(
      createElement(MediaAwareValue, {
        data: {
          type: 'image-url',
          url: 'https://example.com/screenshot.png',
        },
      }),
    );

    expect(html).toContain('Load preview');
    expect(html).toContain('rel="noreferrer"');
    expect(html).not.toContain(
      '<img alt="image preview" class="max-h-72 w-full',
    );
  });

  it('uses anonymous no-referrer media elements', () => {
    const html = renderToStaticMarkup(
      createElement(MediaAwareValue, {
        data: [
          {
            type: 'file',
            mediaType: 'audio/mpeg',
            data: { type: 'data', data: 'SUQz' },
          },
          {
            type: 'file',
            mediaType: 'video/mp4',
            data: { type: 'data', data: 'AAAA' },
          },
        ],
      }),
    );

    expect(html).toMatch(
      /<audio[^>]*crossorigin="anonymous"[^>]*referrerPolicy="no-referrer"/,
    );
    expect(html).toMatch(
      /<video[^>]*crossorigin="anonymous"[^>]*referrerPolicy="no-referrer"/,
    );
  });

  it('truncates large strings in the JSON display', () => {
    const html = renderToStaticMarkup(
      createElement(MediaAwareValue, {
        data: {
          value: 'a'.repeat(16 * 1024 + 10),
        },
      }),
    );

    expect(html).toContain('10 characters omitted from the viewer');
    expect(html).not.toContain('a'.repeat(16 * 1024 + 1));
  });

  it('retains JSON metadata for direct prompt media without a preview source', () => {
    const html = renderToStaticMarkup(
      createElement(MessageBubble, {
        message: {
          role: 'user',
          content: [
            {
              type: 'file',
              filename: 'uploaded-image',
              mediaType: 'image/png',
              data: {
                type: 'reference',
                reference: {
                  providerName: 'example',
                  id: 'provider-file-123',
                },
              },
            },
          ],
        },
      }),
    );

    expect(html).toContain(
      'Preview unavailable; inspect the JSON metadata below.',
    );
    expect(html).toContain('provider-file-123');
  });
});
