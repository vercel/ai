import { Output } from './output';

export type InferGenerateOutput<OUTPUT extends Output> =
  OUTPUT extends Output<infer T, any> ? T : never;

export type InferStreamOutput<OUTPUT extends Output> =
  OUTPUT extends Output<any, infer P> ? P : never;
