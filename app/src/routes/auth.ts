import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db';
import { AuthUser, requireAuth, signToken } from '../auth';
import { HttpError } from '../http';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { username, password } = loginSchema.parse(req.body);
  const { rows } = await pool.query(
    `SELECT id, username, role, employee_id AS "employeeId", password_hash AS "passwordHash"
       FROM users WHERE username = $1`,
    [username],
  );
  const row = rows[0];
  if (!row || !(await bcrypt.compare(password, row.passwordHash))) {
    throw new HttpError(401, 'Invalid username or password');
  }
  const user: AuthUser = { id: row.id, username: row.username, role: row.role, employeeId: row.employeeId };
  res.json({ token: signToken(user), user });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
