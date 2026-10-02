import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { HttpError, idParam, notFound } from '../http';

export const PAYSLIP_SELECT = `
  SELECT p.id, p.payroll_run_id AS "payrollRunId", r.period_year AS "year", r.period_month AS "month",
         p.employee_id AS "employeeId", e.employee_code AS "employeeCode",
         e.first_name || ' ' || e.last_name AS "employeeName", e.department, e.job_title AS "jobTitle",
         p.basic_salary AS "basicSalary", p.housing_allowance AS "housingAllowance",
         p.transport_allowance AS "transportAllowance", p.gross_pay AS "grossPay",
         p.pension, p.income_tax AS "incomeTax", p.total_deductions AS "totalDeductions", p.net_pay AS "netPay"
    FROM payslips p
    JOIN payroll_runs r ON r.id = p.payroll_run_id
    JOIN employees e ON e.id = p.employee_id`;

const listQuerySchema = z.object({
  employeeId: z.coerce.number().int().positive().optional(),
  payrollRunId: z.coerce.number().int().positive().optional(),
});

export const payslipsRouter = Router();

// Admins see all payslips; employees only ever see their own.
payslipsRouter.get('/', async (req, res) => {
  const q = listQuerySchema.parse(req.query);
  const employeeId = req.user!.role === 'admin' ? q.employeeId : req.user!.employeeId;

  const where: string[] = [];
  const params: unknown[] = [];
  if (employeeId) {
    params.push(employeeId);
    where.push(`p.employee_id = $${params.length}`);
  }
  if (q.payrollRunId) {
    params.push(q.payrollRunId);
    where.push(`p.payroll_run_id = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `${PAYSLIP_SELECT} ${whereSql} ORDER BY r.period_year DESC, r.period_month DESC, e.employee_code`,
    params,
  );
  res.json(rows);
});

payslipsRouter.get('/:id', async (req, res) => {
  const { rows } = await pool.query(`${PAYSLIP_SELECT} WHERE p.id = $1`, [idParam(req)]);
  const slip = rows[0];
  if (!slip) throw notFound('Payslip');
  if (req.user!.role !== 'admin' && slip.employeeId !== req.user!.employeeId) {
    throw new HttpError(403, 'You can only view your own payslips');
  }
  res.json(slip);
});
