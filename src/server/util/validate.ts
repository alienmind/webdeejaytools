import { Context } from 'hono';
import { ZodType } from 'zod';
import { PathNotAllowedError } from './paths.js';

export class ValidationError extends Error {
  public readonly status = 400;
  public readonly issues: unknown;
  constructor(message: string, issues?: unknown) {
    super(message);
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

/** Parses and validates a JSON request body, or throws ValidationError. */
export async function parseBody<T>(c: Context, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.issues);
  }
  return result.data;
}

/** Parses and validates query parameters, or throws ValidationError. */
export function parseQuery<T>(c: Context, schema: ZodType<T>): T {
  const result = schema.safeParse(c.req.query());
  if (!result.success) {
    throw new ValidationError('Invalid query parameters', result.error.issues);
  }
  return result.data;
}

/**
 * Maps a thrown error to an HTTP response.
 *
 * Path and validation failures are the caller's fault (403/400); everything else is ours (500) and
 * is logged with its stack rather than leaked to the client.
 */
export function errorResponse(c: Context, err: unknown, context: string) {
  if (err instanceof PathNotAllowedError) {
    console.warn(`[${context}] Rejected path: ${err.message}`);
    return c.json({ error: 'Path is outside the allowed library and download folders.' }, 403);
  }

  if (err instanceof ValidationError) {
    return c.json({ error: err.message, issues: err.issues }, 400);
  }

  console.error(`[${context}] Error:`, err);
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  return c.json({ error: message }, 500);
}
