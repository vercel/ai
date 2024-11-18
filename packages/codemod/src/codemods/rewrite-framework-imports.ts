import { API, FileInfo, JSCodeshift } from 'jscodeshift';

export default function transformer(fileInfo: FileInfo, api: API) {
  const j: JSCodeshift = api.jscodeshift;
  const root = j(fileInfo.source);
  let hasChanges = false;

  root.find(j.ImportDeclaration).forEach(path => {
    const sourceValue = path.node.source.value as string;
    const match = sourceValue.match(/^ai\/(svelte|vue|solid)$/);
    if (match) {
      hasChanges = true;
      path.node.source.value = `@ai-sdk/${match[1]}`;
    }
  });

  return hasChanges ? root.toSource({ quote: 'single' }) : null;
}
