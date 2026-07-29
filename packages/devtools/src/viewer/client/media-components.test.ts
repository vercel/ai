import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MediaAwareValue } from './components/shared-components';

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
    expect(html).not.toContain(
      '<img alt="image preview" class="max-h-72 w-full',
    );
  });
});
