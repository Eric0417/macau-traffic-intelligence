import { z } from "zod";

export const lrtServiceSchema = z.object({
  lines: z.array(z.object({
    name: z.string().min(1),
    weekdayHours: z.string().min(1),
    weekendHours: z.string().min(1),
    frequency: z.string().min(1),
    journeyTime: z.string().min(1),
    timetables: z.array(z.object({
      stationName: z.string().min(1),
      url: z.string().url(),
    })).min(1),
  })).min(3),
  revisionNote: z.string(),
});

export type LrtService = z.infer<typeof lrtServiceSchema>;
