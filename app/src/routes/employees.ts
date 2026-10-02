import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { requireAdmin } from '../auth';
import { HttpError, idParam, notFound } from '../http';

const employeeSchema = z.object({
  employeeCode: z.string().trim().min(1).max(20),
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  email: z.email().max(120),
  department: z.string().trim().min(1).max(50),
  jobTitle: z.string().trim().min(1).max(100),
  hireDate: z.iso.date(),
  status: z.enum(['active', 'inactive']).default('active'),
  salaryStructureId: z.number().int().positive(),
});

const listQuerySchema = z.object({
  search: z.string().trim().optional(),
  department: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const SELECT = `
  SELECT e.id, e.employee_code AS "employeeCode", e.first_name AS "firstName", e.last_name AS "lastName",
         e.email, e.department, e.job_title AS "jobTitle", e.hire_date AS "hireDate", e.status,
         e.salary_structure_id AS "salaryStructureId", s.code AS "salaryStructureCode"
    FROM employees e
    JOIN salary_structures s ON s.id = e.salary_structure_id`;

async function findEmployee(id: number) {
  const { rows } = await pool.query(`${SELECT} WHERE e.id = $1`, [id]);
  if (!rows[0]) throw notFound('Employee');
  return rows[0];
}

async function assertStructureExists(id: number) {
  const { rowCount } = await pool.query('SELECT 1 FROM salary_structures WHERE id = $1', [id]);
  if (!rowCount) throw new HttpError(400, `Salary structure ${id} does not exist`);
}

export const employeesRouter = Router();

employeesRouter.get('/', requireAdmin, async (req, res) => {
  const q = listQuerySchema.parse(req.query);
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.search) {
    params.push(`%${q.search}%`);
    const p = `$${params.length}`;
    where.push(`(e.first_name ILIKE ${p} OR e.last_name ILIKE ${p} OR e.email ILIKE ${p} OR e.employee_code ILIKE ${p})`);
  }
  if (q.department) {
    params.push(q.department);
    where.push(`e.department = $${params.length}`);
  }
  if (q.status) {
    params.push(q.status);
    where.push(`e.status = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = await pool.query(`SELECT count(*)::int AS n FROM employees e ${whereSql}`, params);
  const { rows } = await pool.query(
    `${SELECT} ${whereSql} ORDER BY e.employee_code LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    params,
  );
  res.json({ data: rows, total: total.rows[0].n, page: q.page, pageSize: q.pageSize });
});

// Employees may read their own record; admins may read any.
employeesRouter.get('/:id', async (req, res) => {
  const id = idParam(req);
  if (req.user!.role !== 'admin' && req.user!.employeeId !== id) {
    throw new HttpError(403, 'You can only view your own employee record');
  }
  res.json(await findEmployee(id));
});

employeesRouter.post('/', requireAdmin, async (req, res) => {
  const e = employeeSchema.parse(req.body);
  await assertStructureExists(e.salaryStructureId);
  const { rows } = await pool.query(
    `INSERT INTO employees (employee_code, first_name, last_name, email, department, job_title, hire_date, status, salary_structure_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [e.employeeCode, e.firstName, e.lastName, e.email, e.department, e.jobTitle, e.hireDate, e.status, e.salaryStructureId],
  );
  res.status(201).json(await findEmployee(rows[0].id));
});

employeesRouter.put('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req);
  const e = employeeSchema.parse(req.body);
  await assertStructureExists(e.salaryStructureId);
  const { rowCount } = await pool.query(
    `UPDATE employees
        SET employee_code = $1, first_name = $2, last_name = $3, email = $4, department = $5,
            job_title = $6, hire_date = $7, status = $8, salary_structure_id = $9
      WHERE id = $10`,
    [e.employeeCode, e.firstName, e.lastName, e.email, e.department, e.jobTitle, e.hireDate, e.status, e.salaryStructureId, id],
  );
  if (!rowCount) throw notFound('Employee');
  res.json(await findEmployee(id));
});

// Hard delete is only allowed before an employee has payslips; otherwise set status to inactive.
employeesRouter.delete('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req);
  const paid = await pool.query('SELECT 1 FROM payslips WHERE employee_id = $1 LIMIT 1', [id]);
  if (paid.rowCount) throw new HttpError(409, 'Employee has payslips; set status to inactive instead');
  const { rowCount } = await pool.query('DELETE FROM employees WHERE id = $1', [id]);
  if (!rowCount) throw notFound('Employee');
  res.status(204).end();
});
