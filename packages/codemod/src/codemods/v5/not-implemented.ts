import { createTransformer } from '../lib/create-transformer';
import {
  AI_SDK_CODEMOD_ERROR_PREFIX,
  insertCommentOnce,
} from '../lib/add-comment';

const patterns = [
  {
    keyword: 'appendResponseMessages',
    message:
      'The `appendResponseMessages` option has been removed. Please manually migrate following https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#message-persistence-changes',
  },
  {
    keyword: 'appendClientMessage',
    message:
      'The `appendClientMessage` option has been removed. Please manually migrate following https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#message-persistence-changes',
  },
];

function isStatementOrVarDecl(node: { type: string }) {
  return (
    typeof node.type === 'string' &&
    (node.type.endsWith('Statement') || node.type === 'VariableDeclaration')
  );
}

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  patterns.forEach(({ keyword, message }) => {
    root.find(j.Identifier, { name: keyword }).forEach(path => {
      // Skip if inside import statement
      let parent = path.parent;
      let isInImport = false;
      while (parent) {
        if (
          parent.node.type === 'ImportDeclaration' ||
          parent.node.type === 'ImportSpecifier' ||
          parent.node.type === 'ImportDefaultSpecifier' ||
          parent.node.type === 'ImportNamespaceSpecifier'
        ) {
          isInImport = true;
          break;
        }
        parent = parent.parent;
      }
      if (isInImport) return;

      console.warn(
        `Warning: Found usage of "${keyword}" in ${fileInfo.path}. ${message}`,
      );

      let statementPath = path;

      while (statementPath && statementPath.parent) {
        if (isStatementOrVarDecl(statementPath.parent.node)) {
          statementPath = statementPath.parent;
          break;
        }
        statementPath = statementPath.parent;
      }

      const targetNode =
        statementPath && isStatementOrVarDecl(statementPath.node)
          ? statementPath.node
          : path.node;

      insertCommentOnce(
        targetNode,
        j,
        `${AI_SDK_CODEMOD_ERROR_PREFIX}${message}`,
      );

      context.hasChanges = true;
    });
  });

  return root.toSource();
});
