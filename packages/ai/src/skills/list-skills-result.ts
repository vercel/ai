import { Experimental_SkillsManagerV1Skill } from '@ai-sdk/provider';
import { Warning } from '../types/warning';

export interface ListSkillsResult {
  readonly skills: Experimental_SkillsManagerV1Skill[];
  readonly warnings: Warning[];
}
