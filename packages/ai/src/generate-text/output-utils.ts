import { Output } from './output';

/**
 * Infers the complete output type from the output specification.
 */
export type InferCompleteOutput<OUTPUT extends Output> =
  OUTPUT extends Output<infer COMPLETE_OUTPUT, any> ? COMPLETE_OUTPUT : never;

/**
 * Infers the partial output type from the output specification.
 */
export type InferPartialOutput<OUTPUT extends Output> =
  OUTPUT extends Output<any, infer PARTIAL_OUTPUT> ? PARTIAL_OUTPUT : never;

/**
 * Infers the element type from an array output specification.
 */
export type InferElementOutput<OUTPUT extends Output> =
  OUTPUT extends Output<Array<infer ELEMENT>, any> ? ELEMENT : never;
