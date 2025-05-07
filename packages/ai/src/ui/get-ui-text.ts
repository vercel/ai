import { UIMessagePart } from './ui-messages';

export function getUIText(parts: UIMessagePart[]): string {
  return parts.map(part => (part.type === 'text' ? part.text : '')).join('');
}
