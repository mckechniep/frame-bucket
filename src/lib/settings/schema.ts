import { z } from 'zod';

import { MODEL_IDS } from './constants';

const ModelIdSchema = z.enum([...MODEL_IDS] as [string, ...string[]]);
const EffortSchema = z.enum(['off', 'low', 'medium', 'high']);

const StageSettingSchema = z.object({
  model: ModelIdSchema,
  effort: EffortSchema,
});

/** Validates a full settings object (file contents and admin PUT bodies). */
export const ModelSettingsSchema = z.object({
  recommend: StageSettingSchema,
  generate: StageSettingSchema,
  iterate: StageSettingSchema,
  subpage: StageSettingSchema,
});
