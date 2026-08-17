import { z } from "zod";

export const serviceTierSchema = z.enum(["Tier 1", "Tier 2", "Tier 3"]);
export const serviceStatusSchema = z.enum(["healthy", "degraded", "down"]);

export const saveServiceSchema = z.object({
  id: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(2).max(90),
  owner: z.string().trim().min(2).max(90),
  tier: serviceTierSchema,
  status: serviceStatusSchema,
  slo: z.string().trim().min(2).max(24),
  lastDeploy: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), "Last deploy must be a valid date."),
});

export const deleteServiceSchema = z.object({
  serviceId: z.string().trim().min(1),
});
