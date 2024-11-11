import { API, FileInfo, JSCodeshift } from 'jscodeshift';

export default function transformer(fileInfo: FileInfo, api: API) {
  const j: JSCodeshift = api.jscodeshift;
  const root = j(fileInfo.source);

  // Replace imports
  root.find(j.ImportDeclaration).forEach(path => {
    const specifiers = path.node.specifiers || [];
    path.node.specifiers = specifiers.map(spec => {
      if (
        spec.type === 'ImportSpecifier' &&
        spec.imported.type === 'Identifier' &&
        spec.imported.name === 'toAIStream'
      ) {
        return j.importSpecifier(j.identifier('toDataStream'));
      }
      return spec;
    });
  });

  // Replace function calls
  root.find(j.CallExpression).forEach(path => {
    if (
      path.node.callee.type === 'Identifier' &&
      path.node.callee.name === 'toAIStream'
    ) {
      path.node.callee.name = 'toDataStream';
    }
  });

  return root.toSource({ quote: 'single' });
}
