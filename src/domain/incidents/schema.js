import { z } from "zod";

export const incidentSeveritySchema = z.enum(["SEV-1", "SEV-2", "SEV-3", "SEV-4"]);
export const incidentStatusSchema = z.enum(["active", "monitoring", "resolved"]);
export const stepStatusSchema = z.enum(["pending", "in_progress", "blocked", "done"]);

export const launchIncidentSchema = z.object({
  title: z.string().trim().min(3).max(120),
  serviceId: z.string().trim().min(1),
  runbookId: z.string().trim().min(1),
  severity: incidentSeveritySchema,
});

export const updateStepSchema = z.object({
  incidentId: z.string().trim().min(1),
  stepId: z.string().trim().min(1),
  status: stepStatusSchema,
  assigneeId: z.string().trim().min(1).nullable().optional(),
});

export const assignStepSchema = z.object({
  incidentId: z.string().trim().min(1),
  stepId: z.string().trim().min(1),
  assigneeId: z.string().trim().min(1).nullable(),
});

export const incidentNoteSchema = z.object({
  incidentId: z.string().trim().min(1),
  body: z.string().trim().min(1).max(2_000),
});

export const resolveIncidentSchema = z.object({
  incidentId: z.string().trim().min(1),
});

const reportTextSchema = z.string().trim().max(2_000);

export const incidentReportSchema = z.object({
  incidentId: z.string().trim().min(1),
  summary: reportTextSchema,
  impactSummary: reportTextSchema,
  rootCause: reportTextSchema,
  resolutionSummary: reportTextSchema,
  followUpActions: reportTextSchema,
});
