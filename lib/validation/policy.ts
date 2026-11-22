import { z } from "zod";

export const POLICY_TYPES = ["shipping", "returns", "faq", "other"] as const;
export const POLICY_LANGUAGES = ["es", "en"] as const;

export type PolicyType = (typeof POLICY_TYPES)[number];
export type PolicyLanguage = (typeof POLICY_LANGUAGES)[number];

export const createPolicySchema = z.object({
  type: z.enum(POLICY_TYPES),
  language: z.enum(POLICY_LANGUAGES).default("es"),
  content: z
    .string()
    .trim()
    .min(1, "Policy content is required")
    .max(20000, "Policy content is too long"),
});

export const updatePolicySchema = z.object({
  id: z.string().uuid("Invalid policy id"),
  type: z.enum(POLICY_TYPES),
  language: z.enum(POLICY_LANGUAGES),
  content: z
    .string()
    .trim()
    .min(1, "Policy content is required")
    .max(20000, "Policy content is too long"),
});

export const deletePolicySchema = z.object({
  id: z.string().uuid("Invalid policy id"),
});
