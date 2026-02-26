import { SkillsManagerV1Skill } from '@ai-sdk/provider';
import { Warning } from '../types/warning';

export interface UpdateSkillResult {
  readonly skill: SkillsManagerV1Skill;
  readonly warnings: Warning[];
}
