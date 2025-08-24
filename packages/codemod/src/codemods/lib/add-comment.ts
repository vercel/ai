import type { API, ASTPath } from 'jscodeshift';

export const AI_SDK_CODEMOD_ERROR_PREFIX = 'FIXME(@ai-sdk-codemod-error): ';

function existsComment(
  comments: ASTPath<any>['node']['comments'],
  comment: string,
): boolean {
  let hasComment = false;

  if (comments) {
    comments.forEach((commentNode: any) => {
      const currentComment = commentNode.value;
      if (currentComment === comment) {
        hasComment = true;
      }
    });

    if (hasComment) {
      return true;
    }
  }
  return false;
}

export function insertCommentOnce(
  node: ASTPath<any>['node'],
  j: API['j'],
  comment: string,
): boolean {
  const hasCommentInInlineComments = existsComment(node.comments, comment);
  const hasCommentInLeadingComments = existsComment(
    node.leadingComments,
    comment,
  );

  if (!hasCommentInInlineComments && !hasCommentInLeadingComments) {
    node.comments = [...(node.comments || []), j.commentBlock(comment)];
    return true;
  }

  return false;
}
