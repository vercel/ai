import { API, FileInfo, JSCodeshift } from 'jscodeshift';

export default function transformer(fileInfo: FileInfo, api: API) {
  const j: JSCodeshift = api.jscodeshift;

  return j(fileInfo.source)
    .find(j.ImportDeclaration)
    .forEach(path => {
      if (path.node.source.value === 'ai') {
        path.node.specifiers?.forEach(specifier => {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.name === 'nanoid'
          ) {
            specifier.imported.name = 'generateId';
            if (specifier.local) {
              specifier.local.name = 'generateId';
            }
          }
        });
      }
    })
    .find(j.ObjectExpression)
    .forEach(path => {
      path.node.properties.forEach(property => {
        if (
          property.type === 'ObjectProperty' &&
          property.key.type === 'Identifier' &&
          property.key.name === 'generateId' &&
          property.value.type === 'Identifier' &&
          property.value.name === 'nanoid'
        ) {
          property.value.name = 'generateId';
        }
      });
    })
    .toSource();
}
