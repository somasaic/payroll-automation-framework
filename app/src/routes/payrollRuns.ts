import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { calculatePayslip } from '../payroll';
import { HttpError, idParam, notFound } from '../http';
import { PAYSLIP_SELECT } from './payslips';

const runSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

const SELECT = `
  SELECT r.id, r.period_year AS "year", r.period_month AS "month", r.status,
         r.employee_count AS "employeeCount", r.total_gross AS "totalGross",
         r.total_deductions AS "totalDeductions", r.total_net AS "totalNet",
         u.username AS "createdBy", r.created_at AS "createdAt"
    FROM payroll_runs r
    JOIN users u ON u.id = r.created_by`;

export const payrollRunsRouter = Router();

payrollRunsRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query(`${SELECT} ORDER BY r.period_year DESC, r.period_month DESC`);
  res.json(rows);
});

payrollRunsRouter.get('/:id', async (req, res) => {
  const { rows } = await pool.query(`${SELECT} WHERE r.id = $1`, [idParam(req)]);
  if (!rows[0]) throw notFound('Payroll run');
  res.json(rows[0]);
});

payrollRunsRouter.get('/:id/payslips', async (req, res) => {
  const id = idParam(req);
  const run = await pool.query('SELECT 1 FROM payroll_runs WHERE id = $1', [id]);
  if (!run.rowCount) throw notFound('Payroll run');
  const { rows } = await pool.query(`${PAYSLIP_SELECT} WHERE p.payroll_run_id = $1 ORDER BY e.employee_code`, [id]);
  res.json(rows);
});

/**
 * Runs payroll for one month: creates a payslip for every employee who is
 * active and was hired on or before the last day of that month.
 * A month can only be run once (409 on repeat).
 */
payrollRunsRouter.post('/', async (req, res) => {
  const { year, month } = runSchema.parse(req.body);
  const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT 1 FROM payroll_runs WHERE period_year = $1 AND period_month = $2',
      [year, month],
    );
    if (existing.rowCount) throw new HttpError(409, `Payroll for ${year}-${String(month).padStart(2, '0')} has already been run`);

    const { rows: employees } = await client.query(
      `SELECT e.id, s.basic_salary AS "basicSalary", s.housing_allowance AS "housingAllowance",
              s.transport_allowance AS "transportAllowance", s.pension_rate AS "pensionRate"
         FROM employees e
         JOIN salary_structures s ON s.id = e.salary_structure_id
        WHERE e.status = 'active' AND e.hire_date <= $1
        ORDER BY e.id`,
      [periodEnd],
    );
    if (employees.length === 0) throw new HttpError(422, 'No eligible employees for this period');

    const slips = employees.map((e) => ({ employeeId: e.id as number, ...calculatePayslip(e) }));
    const sum = (key: 'grossPay' | 'totalDeductions' | 'netPay') =>
      slips.reduce((total, s) => total + Math.round(s[key] * 100), 0) / 100;

    const { rows } = await client.query(
      `INSERT INTO payroll_runs (period_year, period_month, employee_count, total_gross, total_deductions, total_net, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [year, month, slips.length, sum('grossPay'), sum('totalDeductions'), sum('netPay'), req.user!.id],
    );
    const runId = rows[0].id;

    for (const s of slips) {
      await client.query(
        `INSERT INTO payslips (payroll_run_id, employee_id, basic_salary, housing_allowance, transport_allowance,
                               gross_pay, pension, income_tax, total_deductions, net_pay)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [runId, s.employeeId, s.basicSalary, s.housingAllowance, s.transportAllowance,
         s.grossPay, s.pension, s.incomeTax, s.totalDeductions, s.netPay],
      );
    }
    await client.query('COMMIT');

    const created = await pool.query(`${SELECT} WHERE r.id = $1`, [runId]);
    res.status(201).json(created.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Deleting a run also deletes its payslips. Useful for resetting test data.
payrollRunsRouter.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM payroll_runs WHERE id = $1', [idParam(req)]);
  if (!rowCount) throw notFound('Payroll run');
  res.status(204).end();
});
