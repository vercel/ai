import { API, FileInfo } from 'jscodeshift';

export default function transformer(file: FileInfo, api: API) {
  const j = api.jscodeshift;
  const root = j(file.source);

  // Find and replace import specifiers
  root
    .find(j.ImportSpecifier)
    .filter(path => path.node.imported.name === 'experimental_useAssistant')
    .forEach(path => {
      j(path).replaceWith(j.importSpecifier(j.identifier('useAssistant')));
    });

  // Find and replace usage in the code
  root
    .find(j.Identifier)
    .filter(path => path.node.name === 'experimental_useAssistant')
    .forEach(path => {
      path.node.name = 'useAssistant';
    });

  return root.toSource();
}
