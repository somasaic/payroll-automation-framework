import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { requireAdmin } from '../auth';
import { HttpError, idParam, notFound } from '../http';

const money = z.number().nonnegative().multipleOf(0.01);

const structureSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(100),
  basicSalary: money,
  housingAllowance: money.default(0),
  transportAllowance: money.default(0),
  pensionRate: z.number().min(0).max(100).default(5),
});

const SELECT = `
  SELECT s.id, s.code, s.name,
         s.basic_salary AS "basicSalary",
         s.housing_allowance AS "housingAllowance",
         s.transport_allowance AS "transportAllowance",
         s.pension_rate AS "pensionRate",
         (SELECT count(*)::int FROM employees e WHERE e.salary_structure_id = s.id) AS "employeeCount"
    FROM salary_structures s`;

export const salaryStructuresRouter = Router();

salaryStructuresRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query(`${SELECT} ORDER BY s.code`);
  res.json(rows);
});

salaryStructuresRouter.get('/:id', async (req, res) => {
  const { rows } = await pool.query(`${SELECT} WHERE s.id = $1`, [idParam(req)]);
  if (!rows[0]) throw notFound('Salary structure');
  res.json(rows[0]);
});

salaryStructuresRouter.post('/', requireAdmin, async (req, res) => {
  const s = structureSchema.parse(req.body);
  const { rows } = await pool.query(
    `INSERT INTO salary_structures (code, name, basic_salary, housing_allowance, transport_allowance, pension_rate)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [s.code, s.name, s.basicSalary, s.housingAllowance, s.transportAllowance, s.pensionRate],
  );
  const created = await pool.query(`${SELECT} WHERE s.id = $1`, [rows[0].id]);
  res.status(201).json(created.rows[0]);
});

salaryStructuresRouter.put('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req);
  const s = structureSchema.parse(req.body);
  const { rowCount } = await pool.query(
    `UPDATE salary_structures
        SET code = $1, name = $2, basic_salary = $3, housing_allowance = $4, transport_allowance = $5, pension_rate = $6
      WHERE id = $7`,
    [s.code, s.name, s.basicSalary, s.housingAllowance, s.transportAllowance, s.pensionRate, id],
  );
  if (!rowCount) throw notFound('Salary structure');
  const updated = await pool.query(`${SELECT} WHERE s.id = $1`, [id]);
  res.json(updated.rows[0]);
});

salaryStructuresRouter.delete('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req);
  const inUse = await pool.query('SELECT 1 FROM employees WHERE salary_structure_id = $1 LIMIT 1', [id]);
  if (inUse.rowCount) throw new HttpError(409, 'Salary structure is assigned to employees');
  const { rowCount } = await pool.query('DELETE FROM salary_structures WHERE id = $1', [id]);
  if (!rowCount) throw notFound('Salary structure');
  res.status(204).end();
});
