import { CoreTool } from '../tool/tool';
import { LanguageModel } from '../types/language-model';

export interface Experimental_Instruction<
  TOOLS extends Record<string, CoreTool>,
> {
  /**
The language model to use.
     */
  model: LanguageModel;

  /**
System message to include in the prompt. Can be used with `prompt` or `messages`.
   */
  system?: string;

  /**
The tools that the model can call. The model needs to support calling tools.
*/
  tools?: TOOLS;
}
