import { DocumentFormat } from '@aws-sdk/client-bedrock-runtime';

export function mapBedrockDocumentFormat(mimeType?: string): DocumentFormat {
  switch (mimeType) {
    case 'text/csv':
      return 'csv';
    case 'application/msword':
      return 'doc';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx';
    case 'text/html':
      return 'html';
    case 'text/markdown':
      return 'md';
    case 'application/pdf':
      return 'pdf';
    case 'text/plain':
      return 'txt';
    case 'application/vnd.ms-excel':
      return 'xls';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return 'xlsx';
    default:
      throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
}
