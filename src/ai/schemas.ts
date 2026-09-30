import { z } from 'zod';

import type { Messages } from '@/i18n';

// The field descriptions steer the model, so they come in the language the fields should be written in
export function photoAnalysisSchema(t: Messages) {
  const d = t.ai.analyze;
  return z.object({
    photos: z.array(
      z.object({
        id: z.string(),
        scene: z.string().describe(d.scene),
        place: z.string().describe(d.place),
        city: z.string().describe(d.city),
        region: z.string().describe(d.region),
        country: z.string().describe(d.country),
        subjects: z.array(z.string()),
        mood: z.string(),
        light: z.string().describe(d.light),
        caption: z.string().describe(d.caption),
        cover_worthy: z.boolean(),
      }),
    ),
  });
}

export type PhotoAnalysis = z.infer<ReturnType<typeof photoAnalysisSchema>>['photos'][number];

export const JournalSchema = z.object({
  title: z.string(),
  summary: z.string(),
  days: z.array(
    z.object({
      date: z.string().describe('YYYY-MM-DD'),
      sections: z.array(
        z.object({
          heading: z.string(),
          text: z.string(),
          photo_ids: z.array(z.string()),
        }),
      ),
    }),
  ),
  xhs: z.object({
    title: z.string(),
    body: z.string(),
    tags: z.array(z.string()),
  }),
});

export type Journal = z.infer<typeof JournalSchema>;
