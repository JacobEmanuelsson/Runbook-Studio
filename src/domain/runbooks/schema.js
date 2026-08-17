import { z } from "zod";
import { incidentSeveritySchema } from "../incidents/schema.js";

export const runbookStepInputSchema = z.object({
  id: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(3).max(120),
  detail: z.string().trim().min(5).max(1_000),
  role: z.string().trim().min(2).max(80),
  required: z.boolean(),
  timeboxMinutes: z.coerce.number().int().min(1).max(240).nullable().optional(),
});

export const saveRunbookSchema = z.object({
  id: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(3).max(120),
  summary: z.string().trim().min(10).max(500),
  serviceId: z.string().trim().min(1),
  defaultSeverity: incidentSeveritySchema,
  estimatedMinutes: z.coerce.number().int().min(1).max(480),
  steps: z.array(runbookStepInputSchema).min(1).max(20),
});

export const deleteRunbookSchema = z.object({
  runbookId: z.string().trim().min(1),
});
