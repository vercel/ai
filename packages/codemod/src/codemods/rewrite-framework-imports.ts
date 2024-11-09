import { API, FileInfo, JSCodeshift } from 'jscodeshift';

export default function transformer(fileInfo: FileInfo, api: API) {
  const j: JSCodeshift = api.jscodeshift;

  return j(fileInfo.source)
    .find(j.ImportDeclaration)
    .forEach(path => {
      const sourceValue = path.node.source.value as string;
      const match = sourceValue.match(/^ai\/(svelte|vue|solid)$/);
      if (match) {
        path.node.source.value = `@ai-sdk/${match[1]}`;
      }
    })
    .toSource({ quote: 'single' });
}
