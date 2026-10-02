# Payroll demo app

A deliberately small payroll application that serves as the **system under test**
for the automation framework in [`/tests`](../tests) (added in later phases).
It has a REST API, a Postgres database seeded with 50 employees, and a plain
HTML/JS web UI.

| Layer    | Tech                                                   |
|----------|--------------------------------------------------------|
| API      | Node 22, Express 5, TypeScript, zod for validation     |
| Database | Postgres 16 (schema and seed loaded on first start)    |
| UI       | Static HTML + vanilla JS served by the API             |
| Auth     | Username/password login returning a JWT bearer token   |

## Running it

Requires Docker with the Compose plugin.

```bash
cd app
docker compose up --build
```

Then open http://localhost:3000. The API is at http://localhost:3000/api and
Postgres is exposed on `localhost:5432` (user/password/db: `payroll`).

To reset all data back to the seed state, drop the database volume:

```bash
docker compose down -v
docker compose up
```

### Seeded logins

| Username    | Password      | Role       | Linked employee           |
|-------------|---------------|------------|---------------------------|
| `admin`     | `admin123`    | `admin`    | –                         |
| `employee`  | `employee123` | `employee` | E002 Mary Johnson         |
| `employee2` | `employee123` | `employee` | E003 Robert Williams      |

- **admin** can do everything.
- **employee** can only read their own employee record and their own payslips.

### Running without Docker (for development)

```bash
cd app
npm install
docker compose up -d db          # or point DATABASE_URL at any Postgres with db/init/*.sql applied
npm run dev                      # http://localhost:3000, reloads on change
```

| Variable       | Default                                             |
|----------------|-----------------------------------------------------|
| `PORT`         | `3000`                                              |
| `DATABASE_URL` | `postgres://payroll:payroll@localhost:5432/payroll` |
| `JWT_SECRET`   | `dev-only-secret-change-me`                         |

Other scripts: `npm run build`, `npm start`, `npm run typecheck`.

## Web UI

| Page          | Route              | Who                | What                                                      |
|---------------|--------------------|--------------------|-----------------------------------------------------------|
| Login         | `#/login`          | everyone           | Sign in; shows an error on bad credentials                |
| Employees     | `#/employees`      | admin              | Search, filter by department/status, paginated (15/page)  |
| Payroll       | `#/payroll`        | admin              | Run payroll for a year/month; list of past runs           |
| Payslips      | `#/payslips`       | admin, employee    | List payslips (`?run=<id>` filters to one run)            |
| Payslip       | `#/payslips/<id>`  | admin, own payslip | Earnings, deductions and net pay                          |

Interactive elements have `data-testid` attributes (e.g. `login-username`,
`employee-row`, `run-submit`, `payslip-net`) to give UI tests stable selectors.

## API

All endpoints except `/api/health` and `/api/auth/login` need an
`Authorization: Bearer <token>` header. Request and response bodies are JSON with
camelCase fields. Money values are numbers with two decimal places.

### Auth

| Method | Path              | Description                                           |
|--------|-------------------|-------------------------------------------------------|
| GET    | `/api/health`     | `{"status":"ok"}` when the API can reach the database |
| POST   | `/api/auth/login` | Body `{username, password}` → `{token, user}`         |
| GET    | `/api/auth/me`    | The user encoded in the token                         |

### Employees

| Method | Path                 | Role               | Description |
|--------|----------------------|--------------------|-------------|
| GET    | `/api/employees`     | admin              | Paginated list. Query: `search` (name, email or code), `department`, `status`, `page` (default 1), `pageSize` (default 20, max 100). Returns `{data, total, page, pageSize}` |
| GET    | `/api/employees/:id` | admin, or self     | One employee |
| POST   | `/api/employees`     | admin              | Create. Body below. `201` |
| PUT    | `/api/employees/:id` | admin              | Replace all fields. Same body as POST |
| DELETE | `/api/employees/:id` | admin              | `204`. `409` if the employee already has payslips (set `status: "inactive"` instead) |

```json
{
  "employeeCode": "E051",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "email": "ada.lovelace@acme-demo.test",
  "department": "Engineering",
  "jobTitle": "Software Engineer",
  "hireDate": "2026-01-15",
  "status": "active",
  "salaryStructureId": 2
}
```

`status` is optional (default `active`). `employeeCode` and `email` must be unique.

### Salary structures

| Method | Path                         | Role  | Description |
|--------|------------------------------|-------|-------------|
| GET    | `/api/salary-structures`     | any   | All structures, each with `employeeCount` |
| GET    | `/api/salary-structures/:id` | any   | One structure |
| POST   | `/api/salary-structures`     | admin | Create. `201` |
| PUT    | `/api/salary-structures/:id` | admin | Replace all fields |
| DELETE | `/api/salary-structures/:id` | admin | `204`. `409` if any employee uses it |

```json
{
  "code": "G6",
  "name": "Grade 6 - Director",
  "basicSalary": 18000,
  "housingAllowance": 3600,
  "transportAllowance": 800,
  "pensionRate": 8
}
```

Allowances default to `0` and `pensionRate` (percent of basic) defaults to `5`.

### Payroll runs (admin only)

| Method | Path                             | Description |
|--------|----------------------------------|-------------|
| GET    | `/api/payroll-runs`              | All runs, newest period first, with totals |
| GET    | `/api/payroll-runs/:id`          | One run |
| GET    | `/api/payroll-runs/:id/payslips` | All payslips in a run |
| POST   | `/api/payroll-runs`              | Body `{year, month}`. Runs payroll for that month. `201`, `409` if that month already ran, `422` if nobody is eligible |
| DELETE | `/api/payroll-runs/:id`          | Deletes a run and its payslips. `204` |

### Payslips

| Method | Path                | Description |
|--------|---------------------|-------------|
| GET    | `/api/payslips`     | Query: `employeeId`, `payrollRunId`. Employees always get only their own, whatever `employeeId` says |
| GET    | `/api/payslips/:id` | One payslip. `403` if an employee asks for someone else's |

### Errors

Errors return `{"error": "<message>"}`. Validation errors add field details:

```json
{ "error": "Validation failed", "details": [{ "field": "email", "message": "Invalid email address" }] }
```

| Status | When |
|--------|------|
| 400 | Invalid body, query or id; malformed JSON; unknown `salaryStructureId` |
| 401 | Missing, invalid or expired token; wrong login |
| 403 | Logged in but not allowed (wrong role, someone else's record) |
| 404 | Resource or route not found |
| 409 | Duplicate code/email, repeat payroll month, delete of a record in use |
| 422 | Payroll run with no eligible employees |

## Payroll rules

A payroll run for a month creates one payslip for every employee whose status is
`active` and whose `hireDate` is on or before the last day of that month. There is
no proration: anyone eligible gets a full month. Amounts are monthly and come from
the employee's salary structure at the time of the run.

```
gross       = basic + housing allowance + transport allowance
pension     = basic × pensionRate / 100
taxable     = gross − pension
income tax  = progressive brackets on taxable (below)
deductions  = pension + income tax
net         = gross − deductions
```

| Monthly taxable income | Rate |
|------------------------|------|
| 0 – 1,000              | 0%   |
| 1,000 – 4,000          | 10%  |
| 4,000 – 8,000          | 20%  |
| over 8,000             | 30%  |

Calculations use integer cents and round half up to the cent. The logic lives in
[`src/payroll.ts`](src/payroll.ts).

Worked example, grade G2 (E002 Mary Johnson): gross 4,500 + 900 + 250 = 5,650.00;
pension 5% of 4,500 = 225.00; taxable 5,425.00; tax 3,000 × 10% + 1,425 × 20% =
585.00; deductions 810.00; **net 4,840.00**.

## Seed data

- **5 salary structures**, G1–G5:

  | Code | Basic     | Housing  | Transport | Pension | Net pay   |
  |------|-----------|----------|-----------|---------|-----------|
  | G1   | 3,000.00  | 600.00   | 200.00    | 5%      | 3,385.00  |
  | G2   | 4,500.00  | 900.00   | 250.00    | 5%      | 4,840.00  |
  | G3   | 6,500.00  | 1,300.00 | 300.00    | 6%      | 6,668.00  |
  | G4   | 8,500.00  | 1,700.00 | 400.00    | 7%      | 8,303.50  |
  | G5   | 14,000.00 | 2,800.00 | 600.00    | 8%      | 12,696.00 |

- **50 employees**, E001–E050, across Engineering, Finance, Human Resources,
  Sales, Operations and Executive. Three are `inactive` (E018, E034, E047), so a
  payroll run for any month in 2026 produces **47 payslips**.
- **3 users**, listed under [Seeded logins](#seeded-logins).

The seed is deterministic: every fresh database has the same rows and ids.

## Database schema

Defined in [`db/init/01-schema.sql`](db/init/01-schema.sql), seeded by
[`db/init/02-seed.sql`](db/init/02-seed.sql). Postgres runs both scripts only when
the data volume is empty.

```
salary_structures 1───* employees 1───* payslips *───1 payroll_runs
                            │                               │
                            0..1                            │ created_by
                            │                               │
                          users ────────────────────────────┘
```

**salary_structures**: pay grades.

| Column                | Type          | Notes                     |
|-----------------------|---------------|---------------------------|
| id                    | serial PK     |                           |
| code                  | varchar(20)   | unique, e.g. `G1`         |
| name                  | varchar(100)  |                           |
| basic_salary          | numeric(12,2) | monthly, ≥ 0              |
| housing_allowance     | numeric(12,2) | monthly, ≥ 0              |
| transport_allowance   | numeric(12,2) | monthly, ≥ 0              |
| pension_rate          | numeric(5,2)  | percent of basic, 0–100   |
| created_at            | timestamptz   |                           |

**employees**

| Column              | Type         | Notes                               |
|---------------------|--------------|-------------------------------------|
| id                  | serial PK    |                                     |
| employee_code       | varchar(20)  | unique, e.g. `E001`                 |
| first_name          | varchar(50)  |                                     |
| last_name           | varchar(50)  |                                     |
| email               | varchar(120) | unique                              |
| department          | varchar(50)  |                                     |
| job_title           | varchar(100) |                                     |
| hire_date           | date         |                                     |
| status              | varchar(10)  | `active` or `inactive`              |
| salary_structure_id | int FK       | → salary_structures.id              |
| created_at          | timestamptz  |                                     |

**users**: login accounts.

| Column        | Type         | Notes                                         |
|---------------|--------------|-----------------------------------------------|
| id            | serial PK    |                                               |
| username      | varchar(50)  | unique                                        |
| password_hash | varchar(100) | bcrypt                                        |
| role          | varchar(10)  | `admin` or `employee`                         |
| employee_id   | int FK       | → employees.id; required when role=`employee` |

**payroll_runs**: one row per processed month.

| Column           | Type          | Notes                              |
|------------------|---------------|------------------------------------|
| id               | serial PK     |                                    |
| period_year      | int           | 2000–2100                          |
| period_month     | int           | 1–12; (year, month) is unique      |
| status           | varchar(10)   | always `completed` for now         |
| employee_count   | int           | number of payslips                 |
| total_gross      | numeric(14,2) | sum of payslip gross_pay           |
| total_deductions | numeric(14,2) | sum of payslip total_deductions    |
| total_net        | numeric(14,2) | sum of payslip net_pay             |
| created_by       | int FK        | → users.id                         |
| created_at       | timestamptz   |                                    |

**payslips**: one row per employee per run; amounts are copied at run time, so
later salary structure changes don't alter past payslips.

| Column              | Type          | Notes                                  |
|---------------------|---------------|----------------------------------------|
| id                  | serial PK     |                                        |
| payroll_run_id      | int FK        | → payroll_runs.id, cascade delete      |
| employee_id         | int FK        | → employees.id                         |
| basic_salary        | numeric(12,2) |                                        |
| housing_allowance   | numeric(12,2) |                                        |
| transport_allowance | numeric(12,2) |                                        |
| gross_pay           | numeric(12,2) |                                        |
| pension             | numeric(12,2) |                                        |
| income_tax          | numeric(12,2) |                                        |
| total_deductions    | numeric(12,2) |                                        |
| net_pay             | numeric(12,2) | unique (payroll_run_id, employee_id)   |

## Project layout

```
app/
├── docker-compose.yml     # db + app
├── Dockerfile             # multi-stage build of the API/UI image
├── db/init/               # schema and seed SQL, run by Postgres on first start
├── public/                # web UI (index.html, app.js, styles.css)
└── src/
    ├── server.ts          # entry point
    ├── app.ts             # Express app and route wiring
    ├── auth.ts            # JWT sign/verify, role guards
    ├── payroll.ts         # pay calculation rules (pure functions)
    ├── db.ts, config.ts, http.ts
    └── routes/            # auth, employees, salaryStructures, payrollRuns, payslips
```
