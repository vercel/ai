import { API, FileInfo, JSCodeshift } from 'jscodeshift';

export default function transformer(fileInfo: FileInfo, api: API) {
  const j: JSCodeshift = api.jscodeshift;
  const root = j(fileInfo.source);

  root.find(j.ImportDeclaration).forEach(path => {
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
  });

  root.find(j.ObjectExpression).forEach(path => {
    path.node.properties.forEach((property, index) => {
      if (
        path.value.type === 'ObjectExpression' &&
        property.type === 'Property' &&
        property.key.type === 'Identifier' &&
        property.key.name === 'generateId' &&
        property.value.type === 'Identifier' &&
        property.value.name === 'nanoid'
      ) {
        let newProperty = j.objectProperty(
          j.identifier('generateId'),
          j.identifier('generateId'),
        );
        newProperty.shorthand = true;
        path.node.properties[index] = newProperty;
      }
    });
  });

  return root.toSource();
}
