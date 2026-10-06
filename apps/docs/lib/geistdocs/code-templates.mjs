import { hasCodeTemplate, renderGatewayCode } from '../code-template.mjs';

const visit = (node, transform) => {
  transform(node);
  for (const child of node.children ?? []) visit(child, transform);
};

// Keep a concrete default in the Markdown exported by Fumadocs, while carrying
// the original template to the HTML pipeline for the provider/model selector.
export const remarkCodeTemplates = () => tree => {
  visit(tree, node => {
    if (node.type !== 'code' || !hasCodeTemplate(node.value)) return;
    node.data ??= {};
    node.data.hProperties = {
      ...node.data.hProperties,
      'data-code-template': node.value,
      'data-code-language': node.lang ?? 'typescript',
      'data-code-meta': node.meta ?? '',
    };
    node.value = renderGatewayCode(node.value);
  });
};

// Run before Shiki replaces <pre><code> with highlighted markup. Ordinary
// fences continue through the package's default syntax-highlighting pipeline.
export const rehypeCodeTemplates = () => tree => {
  visit(tree, node => {
    if (node.type !== 'element' || node.tagName !== 'pre') return;
    const code = node.children?.[0];
    const template = code?.properties?.['data-code-template'];
    if (typeof template !== 'string') return;
    const props = {
      code: template,
      language: code.properties['data-code-language'],
      meta: code.properties['data-code-meta'],
    };
    node.type = 'mdxJsxFlowElement';
    node.name = 'CodeTemplate';
    node.attributes = Object.entries(props).map(([name, value]) => ({
      type: 'mdxJsxAttribute', name, value,
    }));
    node.children = [];
    delete node.tagName;
    delete node.properties;
  });
};
