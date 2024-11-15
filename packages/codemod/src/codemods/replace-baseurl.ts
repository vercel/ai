import { API, FileInfo } from 'jscodeshift';

const PROVIDER_CREATORS = [
  'createAnthropic',
  'createAzure',
  'createCohere',
  'createGoogle',
  'createGoogleGenerativeAI',
  'createGroq',
  'createMistral',
  'createOpenAI',
];

function isWithinProviderCall(j: any, path: any): boolean {
  // Walk up the AST to find parent CallExpression
  let current = path;
  while (current) {
    if (
      current.parent?.node.type === 'CallExpression' &&
      current.parent.node.callee.type === 'Identifier' &&
      PROVIDER_CREATORS.includes(current.parent.node.callee.name)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

export default function transformer(fileInfo: FileInfo, api: API) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  // Find and rename baseUrl properties
  root
    .find(j.ObjectProperty, {
      key: {
        type: 'Identifier',
        name: 'baseUrl',
      },
    })
    .filter(path => isWithinProviderCall(j, path))
    .forEach(path => {
      // Rename baseUrl to baseURL
      if (path.node.key.type === 'Identifier') {
        path.node.key.name = 'baseURL';
      }
    });

  return root.toSource();
}
