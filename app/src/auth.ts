import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { HttpError } from './http';

export type Role = 'admin' | 'employee';

export interface AuthUser {
  id: number;
  username: string;
  role: Role;
  employeeId: number | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

/** Requires a valid `Authorization: Bearer <token>` header. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Missing bearer token');
  try {
    const { id, username, role, employeeId } = jwt.verify(token, config.jwtSecret) as AuthUser;
    req.user = { id, username, role, employeeId };
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') throw new HttpError(403, 'Admin role required');
  next();
}
