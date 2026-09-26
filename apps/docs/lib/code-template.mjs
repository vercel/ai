export const DEFAULT_MODEL_IDS = {
  text: 'anthropic/claude-sonnet-5',
  image: 'openai/gpt-image-2.5-sunburst',
  video: 'google/veo-3.1-generate-001',
};

export const MODEL_KIND_PLACEHOLDERS = {
  text: ['__TEXT_MODEL__', '__MODEL__'],
  image: ['__IMAGE_MODEL__'],
  video: ['__VIDEO_MODEL__'],
};

export const hasCodeTemplate = code =>
  /__(?:MODEL|TEXT_MODEL|IMAGE_MODEL|VIDEO_MODEL|PROVIDER_IMPORT)__/.test(code);

export const renderGatewayCode = code => {
  let result = code;
  for (const [kind, placeholders] of Object.entries(MODEL_KIND_PLACEHOLDERS)) {
    for (const placeholder of placeholders) {
      result = result.replaceAll(placeholder, `"${DEFAULT_MODEL_IDS[kind]}"`);
    }
  }
  return result.replace(/.*__PROVIDER_IMPORT__.*\n?/g, '').trim();
};

export const parseHighlightedLines = meta =>
  (meta.match(/\{([\d,\s-]+)\}/)?.[1] ?? '')
    .split(',')
    .filter(Boolean)
    .flatMap(range => {
      const [start, end = start] = range.trim().split('-').map(Number);
      return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);
    });

// Removing the provider import shifts all subsequent highlight positions.
export const gatewayHighlightedLines = (code, highlightedLines) => {
  const lines = code.split('\n');
  return highlightedLines.flatMap(line => {
    if (lines[line - 1]?.includes('__PROVIDER_IMPORT__')) return [];
    const removed = lines.slice(0, line).filter(value => value.includes('__PROVIDER_IMPORT__')).length;
    return [line - removed];
  });
};
