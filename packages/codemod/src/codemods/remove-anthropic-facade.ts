import { API, FileInfo, JSCodeshift } from 'jscodeshift';

export default function transformer(fileInfo: FileInfo, api: API) {
  const j: JSCodeshift = api.jscodeshift;
  const root = j(fileInfo.source);

  // Replace imports
  root.find(j.ImportDeclaration).forEach(path => {
    const sourceValue = path.node.source.value;
    if (sourceValue === '@ai-sdk/anthropic') {
      const hasAnthropicSpecifier = path.node.specifiers?.some(
        spec =>
          spec.type === 'ImportSpecifier' && spec.imported.name === 'Anthropic',
      );

      if (hasAnthropicSpecifier) {
        path.node.source.value = '@ai-sdk/anthropic';
        path.node.specifiers = [
          j.importSpecifier(j.identifier('createAnthropic')),
        ];
      }
    }
  });

  // Replace new Anthropic() with createAnthropic()
  root.find(j.NewExpression).forEach(path => {
    if (
      path.node.callee.type === 'Identifier' &&
      path.node.callee.name === 'Anthropic'
    ) {
      j(path).replaceWith(
        j.callExpression(j.identifier('createAnthropic'), path.node.arguments),
      );
    }
  });

  // Replace method calls.
  root.find(j.CallExpression).forEach(path => {
    if (
      path.node.callee.type === 'MemberExpression' &&
      path.node.callee.object.type === 'Identifier' &&
      path.node.callee.property.type === 'Identifier' &&
      (path.node.callee.property.name === 'messages' ||
        path.node.callee.property.name === 'chat')
    ) {
      const providerVar = path.node.callee.object.name;
      j(path).replaceWith(
        j.callExpression(j.identifier(providerVar), path.node.arguments),
      );
    }
  });

  return root.toSource({ quote: 'single' });
}
