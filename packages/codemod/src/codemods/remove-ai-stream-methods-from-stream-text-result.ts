import { API, FileInfo, JSCodeshift } from 'jscodeshift';

const REMOVED_METHODS = [
  'toAIStream',
  'pipeAIStreamToResponse',
  'toAIStreamResponse',
];

export default function transformer(fileInfo: FileInfo, api: API) {
  const j: JSCodeshift = api.jscodeshift;
  const root = j(fileInfo.source);
  let hasRemovedMethods = false;

  // Find calls to removed methods
  root.find(j.MemberExpression).forEach(path => {
    if (
      path.node.property.type === 'Identifier' &&
      REMOVED_METHODS.includes(path.node.property.name)
    ) {
      hasRemovedMethods = true;

      // Find the parent statement to add the comment
      const statement = path.parent.parent;
      if (statement && statement.node) {
        // Add block comment above the statement
        const comment = j.commentBlock(
          ` WARNING: ${path.node.property.name} has been removed from streamText.\n` +
            ` See migration guide at https://sdk.vercel.ai/docs/migrations `,
          true, // leading
          false, // trailing
        );

        statement.node.comments = statement.node.comments || [];
        statement.node.comments.unshift(comment);
      }
    }
  });

  if (hasRemovedMethods) {
    api.report(
      `Found usage of removed streamText methods: ${REMOVED_METHODS.join(
        ', ',
      )}. These methods have been removed. Please see migration guide.`,
    );
  }

  return root.toSource({ quote: 'single' });
}
