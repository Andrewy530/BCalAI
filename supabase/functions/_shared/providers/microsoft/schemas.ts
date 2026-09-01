import { z } from 'zod';

/** Microsoft identity platform token success payload. */
export const microsoftTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string().min(1).optional(),
});

/** Machine-readable token error fields; descriptions are intentionally ignored. */
export const microsoftTokenErrorSchema = z.object({
  error: z.string().min(1).optional(),
  error_description: z.string().optional(),
});

/** The small identity projection requested from Microsoft Graph `/me`. */
export const microsoftUserInfoSchema = z.object({
  id: z.string().min(1),
  mail: z.string().min(1).nullable().optional(),
  userPrincipalName: z.string().min(1).nullable().optional(),
});
