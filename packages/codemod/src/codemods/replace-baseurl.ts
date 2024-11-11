import { API, FileInfo, JSCodeshift } from 'jscodeshift';

export default function transformer(fileInfo: FileInfo, api: API) {
  const j: JSCodeshift = api.jscodeshift;
  const root = j(fileInfo.source);

  root.find(j.Identifier, { name: 'baseUrl' }).forEach(path => {
    path.node.name = 'baseURL';
  });

  root.find(j.ObjectExpression).forEach(path => {
    path.node.properties.forEach((property, index) => {
      if (
        property.type === 'Property' &&
        property.key.type === 'Identifier' &&
        property.key.name === 'baseUrl'
      ) {
        property.key.name = 'baseURL';
      }
      if (
        property.type === 'Property' &&
        property.value.type === 'Identifier' &&
        property.value.name === 'baseUrl'
      ) {
        property.value.name = 'baseURL';
      }
    });
  });

  return root.toSource();
}
