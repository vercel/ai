import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type ZirnayDecisionModelId =
  | 'zirnay/anyjev-fast-router:latest'
  | 'zirnay/anyjev-fast-router:v2-strict'
  | 'zirnay/laya:latest'
  | 'zirnay/strands-dc:latest'
  | (string & {});

export const zirnayDecisionModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * Calibration constraints enforced by the Zirnay decision engine.
       */
      constraints: z
        .object({
          maxEceThreshold: z.number().min(0).max(1).optional(),
          minConfidence: z.number().min(0).max(1).optional(),
        })
        .optional(),

      /**
       * Arbitration strategy for multi-candidate selection.
       * e.g., 'calibrated_utility'.
       */
      arbitrationStrategy: z.string().optional(),

      /**
       * Decision type to submit to Zirnay.
       */
      decisionType: z.string().optional(),

      /**
       * Multi-tenant account ID (`X-Zirnay-Account-ID` header).
       */
      accountId: z.string().optional(),
    }),
  ),
);

export type ZirnayDecisionModelOptions = InferSchema<
  typeof zirnayDecisionModelOptions
>;

export type ZirnayDecisionProviderMetadata = {
  confidence: Record<string, number>;
  calibratedProbability: Record<string, number>;
  marginOverSecond: Record<string, number>;
  candidateScores: Record<
    string,
    Array<{
      candidateId: string;
      rawLogit?: number | null;
      calibratedProb?: number | null;
      utilityScore?: number | null;
    }>
  >;
  auditTrail: Record<
    string,
    {
      reasoningCode?: string | null;
      explanation?: string | null;
      citations?: Array<{
        source?: string | null;
        id?: string | null;
        relevance?: number | null;
      }> | null;
    }
  >;
  telemetry: Record<
    string,
    {
      latencyMs?: number | null;
      expectedCalibrationError?: number | null;
      permutationRounds?: number | null;
      dataRetention?: string | null;
    }
  >;
};
