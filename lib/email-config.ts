/**
 * Resend settings, normalized once. Blank values (e.g. a Railway template
 * default of "   ") count as unset, so an instance without a real key falls
 * back to logging magic links instead of failing every send.
 */
function envOrUndefined(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export const RESEND_API_KEY = envOrUndefined("RESEND_API_KEY");
export const RESEND_FROM = envOrUndefined("RESEND_FROM") ?? "onboarding@resend.dev";
