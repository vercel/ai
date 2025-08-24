import { createTransformer } from '../lib/create-transformer';
import {
  AI_SDK_CODEMOD_ERROR_PREFIX,
  insertCommentOnce,
} from '../lib/add-comment';
import type { ASTPath, Identifier, MemberExpression } from 'jscodeshift';

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
  {
    keyword: 'part.toolInvocation.toolName',
    message:
      'The `part.toolInvocation.toolName` property has been removed. Please manually migrate following https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#tool-part-type-changes-uimessage',
  },
  {
    keyword: 'part.toolInvocation.state',
    message:
      'The `part.toolInvocation.state` property has been removed. Please manually migrate following https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#tool-part-type-changes-uimessage',
  },
];

function isStatementOrVarDecl(node: { type: string }) {
  return (
    typeof node.type === 'string' &&
    (node.type.endsWith('Statement') || node.type === 'VariableDeclaration')
  );
}

function isInImportDeclaration(path: ASTPath): boolean {
  let parent = path.parent;
  while (parent) {
    if (
      parent.node.type === 'ImportDeclaration' ||
      parent.node.type === 'ImportSpecifier' ||
      parent.node.type === 'ImportDefaultSpecifier' ||
      parent.node.type === 'ImportNamespaceSpecifier'
    ) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

function getMemberExpressionChain(node: MemberExpression): string[] | null {
  const chain: string[] = [];
  let current: MemberExpression | Identifier | null = node;
  while (current && current.type === 'MemberExpression') {
    if (current.property.type === 'Identifier') {
      chain.unshift(current.property.name);
    } else {
      // only support dot notation
      return null;
    }
    current = current.object as MemberExpression | Identifier;
  }
  if (current && current.type === 'Identifier') {
    chain.unshift(current.name);
  } else {
    return null;
  }
  return chain;
}

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  patterns.forEach(({ keyword, message }) => {
    if (keyword.includes('.')) {
      const parts = keyword.split('.');
      root.find(j.MemberExpression).forEach(path => {
        const chain = getMemberExpressionChain(path.node);
        if (!chain) return;
        if (chain.length !== parts.length) return;
        for (let i = 0; i < parts.length; i++) {
          if (chain[i] !== parts[i]) return;
        }

        if (isInImportDeclaration(path)) return;

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
    } else {
      root.find(j.Identifier, { name: keyword }).forEach(path => {
        if (isInImportDeclaration(path)) return;

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
    }
  });

  return root.toSource();
});
