import { z } from 'zod';

export const PhotoAnalysisSchema = z.object({
  photos: z.array(
    z.object({
      id: z.string(),
      scene: z.string().describe('地点或场景，如能认出具体地标请写出名称'),
      place: z.string().describe('拍摄地点的简短名称（景点、街区或地标），结合坐标和画面判断；判断不了填空字符串'),
      city: z.string().describe('所在城市的中文名，依据坐标判断；没有坐标填空字符串'),
      region: z.string().describe('所在省份或一级行政区的中文名；没有坐标填空字符串'),
      country: z.string().describe('所在国家的中文名；没有坐标填空字符串'),
      subjects: z.array(z.string()),
      mood: z.string(),
      light: z.string().describe('光线描述，如逆光、侧光、晨雾、夜景灯光'),
      caption: z.string().describe('一句不超过 20 字的图注'),
      cover_worthy: z.boolean(),
    }),
  ),
});

export type PhotoAnalysis = z.infer<typeof PhotoAnalysisSchema>['photos'][number];

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
