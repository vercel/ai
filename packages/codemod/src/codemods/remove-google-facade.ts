import { API, FileInfo, JSCodeshift } from 'jscodeshift';

export default function transformer(fileInfo: FileInfo, api: API) {
  const j: JSCodeshift = api.jscodeshift;
  const root = j(fileInfo.source);

  // Replace imports
  root.find(j.ImportDeclaration).forEach(path => {
    const sourceValue = path.node.source.value;
    if (
      sourceValue === '@ai-sdk/google' ||
      sourceValue.includes('google-facade')
    ) {
      const hasGoogleSpecifier = path.node.specifiers?.some(
        spec =>
          spec.type === 'ImportSpecifier' && spec.imported.name === 'Google',
      );

      if (hasGoogleSpecifier) {
        path.node.source.value = '@ai-sdk/google';
        path.node.specifiers = [
          j.importSpecifier(j.identifier('createGoogleGenerativeAI')),
        ];
      }
    }
  });

  // Replace new Google() with createGoogleGenerativeAI()
  root.find(j.NewExpression).forEach(path => {
    if (
      path.node.callee.type === 'Identifier' &&
      path.node.callee.name === 'Google'
    ) {
      j(path).replaceWith(
        j.callExpression(
          j.identifier('createGoogleGenerativeAI'),
          path.node.arguments,
        ),
      );
    }
  });

  // Replace method calls
  root.find(j.CallExpression).forEach(path => {
    if (
      path.node.callee.type === 'MemberExpression' &&
      path.node.callee.object.type === 'Identifier'
    ) {
      const methodName = path.node.callee.property.name;
      if (
        [
          'chat',
          'generativeAI',
          'embedding',
          'textEmbedding',
          'textEmbeddingModel',
        ].includes(methodName)
      ) {
        const providerVar = path.node.callee.object.name;
        j(path).replaceWith(
          j.callExpression(j.identifier(providerVar), path.node.arguments),
        );
      }
    }
  });

  return root.toSource({ quote: 'single' });
}
