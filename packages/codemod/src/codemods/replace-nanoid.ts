import { API, FileInfo, JSCodeshift } from 'jscodeshift';

export default function transformer(file: FileInfo, api: API) {
  const j: JSCodeshift = api.jscodeshift;
  const root = j(file.source);

  // First replace the import
  root
    .find(j.ImportSpecifier, {
      imported: { name: 'nanoid' },
    })
    .replaceWith(() => j.importSpecifier(j.identifier('generateId')));

  // Then handle the object property transformation
  root
    .find(j.ObjectProperty, {
      key: { name: 'generateId' },
      value: { name: 'nanoid' },
    })
    .replaceWith(() => {
      let newProperty = j.objectProperty(
        j.identifier('generateId'),
        j.identifier('generateId'),
      );
      newProperty.shorthand = true;
      return newProperty;
    });

  return root.toSource();
}
