import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`);

/** Parses a positive integer route param, or throws 400. */
export function idParam(req: Request, name = 'id'): number {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `Invalid ${name}`);
  return id;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  // Postgres constraint violations
  const code = (err as { code?: string }).code;
  if (code === '23505') return res.status(409).json({ error: 'Resource already exists' });
  if (code === '23503') return res.status(409).json({ error: 'Resource is referenced by other records' });
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
