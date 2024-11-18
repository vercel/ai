// @ts-nocheck
import { formatStreamPart } from 'ai';

const response = new Response(formatStreamPart('text', cached));
