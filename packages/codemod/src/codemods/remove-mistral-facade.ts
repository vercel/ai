import { API, FileInfo, JSCodeshift } from 'jscodeshift';

export default function transformer(fileInfo: FileInfo, api: API) {
  const j: JSCodeshift = api.jscodeshift;
  const root = j(fileInfo.source);

  // Replace imports
  root.find(j.ImportDeclaration).forEach(path => {
    const sourceValue = path.node.source.value;
    if (
      sourceValue === '@ai-sdk/mistral' ||
      sourceValue.includes('mistral-facade')
    ) {
      const hasMistralSpecifier = path.node.specifiers?.some(
        spec =>
          spec.type === 'ImportSpecifier' && spec.imported.name === 'Mistral',
      );

      if (hasMistralSpecifier) {
        path.node.source.value = '@ai-sdk/mistral';
        path.node.specifiers = [
          j.importSpecifier(j.identifier('createMistral')),
        ];
      }
    }
  });

  // Replace new Mistral() with createMistral()
  root.find(j.NewExpression).forEach(path => {
    if (
      path.node.callee.type === 'Identifier' &&
      path.node.callee.name === 'Mistral'
    ) {
      j(path).replaceWith(
        j.callExpression(j.identifier('createMistral'), path.node.arguments),
      );
    }
  });

  // Replace method calls
  root.find(j.CallExpression).forEach(path => {
    if (
      path.node.callee.type === 'MemberExpression' &&
      path.node.callee.object.type === 'Identifier' &&
      (path.node.callee.property.name === 'chat' ||
        path.node.callee.property.name === 'messages')
    ) {
      const providerVar = path.node.callee.object.name;
      j(path).replaceWith(
        j.callExpression(j.identifier(providerVar), path.node.arguments),
      );
    }
  });

  return root.toSource({ quote: 'single' });
}
