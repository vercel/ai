import assert from 'node:assert/strict';
import test from 'node:test';
import {
  gatewayHighlightedLines,
  parseHighlightedLines,
  renderGatewayCode,
} from '../lib/code-template.mjs';
import {
  rehypeCodeTemplates,
  remarkCodeTemplates,
} from '../lib/geistdocs/code-templates.mjs';

const template = `import { generateText } from 'ai';
__PROVIDER_IMPORT__;

const { text } = await generateText({
  model: __MODEL__,
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});`;

test('renders usable default code while retaining the template and fence metadata for HTML', () => {
  const code = {
    type: 'code',
    lang: 'tsx',
    meta: 'title="app/page.tsx" {2,5-6}',
    value: template,
  };
  // Fences can be nested in lists, quotes, and MDX components.
  const tree = { type: 'root', children: [{ type: 'blockquote', children: [code] }] };
  remarkCodeTemplates()(tree);
  assert.equal(code.value, `import { generateText } from 'ai';

const { text } = await generateText({
  model: "anthropic/claude-sonnet-5",
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});`);
  assert.equal(code.data.hProperties['data-code-template'], template);
  assert.equal(code.data.hProperties['data-code-language'], 'tsx');
  assert.equal(code.data.hProperties['data-code-meta'], code.meta);

  // mdast-util-to-hast carries hProperties onto the <code> element.
  const pre = {
    type: 'element', tagName: 'pre', properties: {},
    children: [{ type: 'element', tagName: 'code', properties: code.data.hProperties,
      children: [{ type: 'text', value: code.value }] }],
  };
  rehypeCodeTemplates()({ type: 'root', children: [pre] });
  assert.equal(pre.type, 'mdxJsxFlowElement');
  assert.equal(pre.name, 'CodeTemplate');
  assert.deepEqual(Object.fromEntries(pre.attributes.map(({ name, value }) => [name, value])), {
    code: template, language: 'tsx', meta: code.meta,
  });
  assert.deepEqual(pre.children, []);
});

test('resolves every model kind, including mixed and repeated placeholders', () => {
  const code = renderGatewayCode(`__PROVIDER_IMPORT__;
text: __MODEL__, __TEXT_MODEL__
image: __IMAGE_MODEL__, __IMAGE_MODEL__
video: __VIDEO_MODEL__`);
  assert.equal(code, `text: "anthropic/claude-sonnet-5", "anthropic/claude-sonnet-5"
image: "openai/gpt-image-2.5-sunburst", "openai/gpt-image-2.5-sunburst"
video: "google/veo-3.1-generate-001"`);
});

test('preserves ordinary fences and inline placeholder mentions', () => {
  const tree = { type: 'root', children: [
    { type: 'code', lang: 'ts', value: 'const model = "openai/gpt-5";' },
    { type: 'inlineCode', value: '__MODEL__' },
  ] };
  const original = structuredClone(tree);
  remarkCodeTemplates()(tree);
  assert.deepEqual(tree, original);

  const html = { type: 'root', children: [{ type: 'element', tagName: 'pre', children: [
    { type: 'element', tagName: 'code', properties: {}, children: [] },
  ] }] };
  const originalHtml = structuredClone(html);
  rehypeCodeTemplates()(html);
  assert.deepEqual(html, originalHtml);
});

test('keeps line highlights on the same code when the provider import is removed', () => {
  const lines = parseHighlightedLines('title="app/page.tsx" {2,5-6}');
  assert.deepEqual(lines, [2, 5, 6]);
  assert.deepEqual(gatewayHighlightedLines(template, lines), [4, 5]);
  assert.deepEqual(gatewayHighlightedLines('first\nsecond\nthird', [1, 3]), [1, 3]);
  assert.deepEqual(parseHighlightedLines(''), []);
});
