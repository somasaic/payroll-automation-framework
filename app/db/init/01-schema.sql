-- Schema for the demo payroll app.
-- Money columns are NUMERIC(12,2); all amounts are monthly unless named otherwise.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE salary_structures (
  id                  SERIAL PRIMARY KEY,
  code                VARCHAR(20)   NOT NULL UNIQUE,
  name                VARCHAR(100)  NOT NULL,
  basic_salary        NUMERIC(12,2) NOT NULL CHECK (basic_salary >= 0),
  housing_allowance   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (housing_allowance >= 0),
  transport_allowance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (transport_allowance >= 0),
  pension_rate        NUMERIC(5,2)  NOT NULL DEFAULT 5 CHECK (pension_rate BETWEEN 0 AND 100),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE employees (
  id                  SERIAL PRIMARY KEY,
  employee_code       VARCHAR(20)  NOT NULL UNIQUE,
  first_name          VARCHAR(50)  NOT NULL,
  last_name           VARCHAR(50)  NOT NULL,
  email               VARCHAR(120) NOT NULL UNIQUE,
  department          VARCHAR(50)  NOT NULL,
  job_title           VARCHAR(100) NOT NULL,
  hire_date           DATE         NOT NULL,
  status              VARCHAR(10)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  salary_structure_id INTEGER      NOT NULL REFERENCES salary_structures(id),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role          VARCHAR(10)  NOT NULL CHECK (role IN ('admin', 'employee')),
  employee_id   INTEGER      REFERENCES employees(id),
  CHECK (role = 'admin' OR employee_id IS NOT NULL)
);

CREATE TABLE payroll_runs (
  id               SERIAL PRIMARY KEY,
  period_year      INTEGER       NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
  period_month     INTEGER       NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status           VARCHAR(10)   NOT NULL DEFAULT 'completed' CHECK (status IN ('completed')),
  employee_count   INTEGER       NOT NULL,
  total_gross      NUMERIC(14,2) NOT NULL,
  total_deductions NUMERIC(14,2) NOT NULL,
  total_net        NUMERIC(14,2) NOT NULL,
  created_by       INTEGER       NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (period_year, period_month)
);

CREATE TABLE payslips (
  id                  SERIAL PRIMARY KEY,
  payroll_run_id      INTEGER       NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id         INTEGER       NOT NULL REFERENCES employees(id),
  basic_salary        NUMERIC(12,2) NOT NULL,
  housing_allowance   NUMERIC(12,2) NOT NULL,
  transport_allowance NUMERIC(12,2) NOT NULL,
  gross_pay           NUMERIC(12,2) NOT NULL,
  pension             NUMERIC(12,2) NOT NULL,
  income_tax          NUMERIC(12,2) NOT NULL,
  total_deductions    NUMERIC(12,2) NOT NULL,
  net_pay             NUMERIC(12,2) NOT NULL,
  UNIQUE (payroll_run_id, employee_id)
);

CREATE INDEX idx_employees_department ON employees(department);
CREATE INDEX idx_payslips_employee ON payslips(employee_id);
