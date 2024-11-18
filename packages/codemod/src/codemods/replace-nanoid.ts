import { API, FileInfo, JSCodeshift } from 'jscodeshift';

export default function transformer(file: FileInfo, api: API) {
  const j: JSCodeshift = api.jscodeshift;
  const root = j(file.source);

  // Track if we need to replace usage in the code
  let shouldReplaceUsage = false;

  // Find and replace import specifiers from 'ai'
  root
    .find(j.ImportDeclaration)
    .filter(path => path.node.source.value === 'ai')
    .forEach(path => {
      j(path)
        .find(j.ImportSpecifier)
        .filter(specifierPath => specifierPath.node.imported.name === 'nanoid')
        .forEach(specifierPath => {
          shouldReplaceUsage = true;
          specifierPath.replace(j.importSpecifier(j.identifier('generateId')));
        });
    });

  // If we replaced the import, replace object properties in the code
  if (shouldReplaceUsage) {
    root
      .find(j.ObjectProperty, {
        key: { name: 'generateId' },
        value: { name: 'nanoid' },
      })
      .forEach(path => {
        const newProperty = j.objectProperty(
          j.identifier('generateId'),
          j.identifier('generateId'),
        );
        newProperty.shorthand = true;
        j(path).replaceWith(newProperty);
      });
  }

  return root.toSource();
}
