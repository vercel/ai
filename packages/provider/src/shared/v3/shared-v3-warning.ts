/**
 * Warning from the model that certain features are e.g. unsupported or that compatibility
 * functionality is used (which might lead to suboptimal results).
 */
export type SharedV3Warning =
  | {
      /**
       * A configuration setting is not supported by the model.
       */
      type: 'unsupported-setting';
      setting: string;
      details?: string;
    }
  | {
      /**
       * A compatibility feature is used that might lead to suboptimal results.
       */
      type: 'compatibility';
      feature: string;
      details?: string;
    }
  | {
      /**
       * Other warning.
       */
      type: 'other';
      message: string;
    };
