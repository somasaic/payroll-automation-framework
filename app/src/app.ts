import express from 'express';
import path from 'path';
import { pool } from './db';
import { requireAdmin, requireAuth } from './auth';
import { errorHandler, HttpError } from './http';
import { authRouter } from './routes/auth';
import { employeesRouter } from './routes/employees';
import { salaryStructuresRouter } from './routes/salaryStructures';
import { payrollRunsRouter } from './routes/payrollRuns';
import { payslipsRouter } from './routes/payslips';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/employees', requireAuth, employeesRouter);
  app.use('/api/salary-structures', requireAuth, salaryStructuresRouter);
  app.use('/api/payroll-runs', requireAuth, requireAdmin, payrollRunsRouter);
  app.use('/api/payslips', requireAuth, payslipsRouter);
  app.use('/api', () => {
    throw new HttpError(404, 'Route not found');
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(errorHandler);
  return app;
}
