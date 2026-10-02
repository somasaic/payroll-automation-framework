// Minimal single-page UI built with plain DOM APIs. Routes live in the URL hash.
// Elements carry data-testid attributes so UI tests have stable selectors.

const view = document.getElementById('view');
const session = {
  get token() { return localStorage.getItem('token'); },
  get user() { return JSON.parse(localStorage.getItem('user') || 'null'); },
  save(token, user) { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); },
  clear() { localStorage.removeItem('token'); localStorage.removeItem('user'); },
};

const money = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const period = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
  });
  if (res.status === 401 && path !== '/auth/login') {
    session.clear();
    location.hash = '#/login';
    throw new Error('Session expired');
  }
  const body = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

// ---- Views -----------------------------------------------------------------

function renderLogin() {
  view.innerHTML = `
    <form class="card login" id="login-form" data-testid="login-form">
      <h2>Sign in</h2>
      <label>Username <input name="username" autocomplete="username" data-testid="login-username" required></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" data-testid="login-password" required></label>
      <p class="error" data-testid="login-error" hidden></p>
      <button type="submit" data-testid="login-submit">Sign in</button>
    </form>`;
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = form.querySelector('.error');
    error.hidden = true;
    try {
      const { token, user } = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: form.username.value, password: form.password.value }),
      });
      session.save(token, user);
      location.hash = user.role === 'admin' ? '#/employees' : '#/payslips';
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });
}

const employeeFilters = { search: '', department: '', status: '', page: 1 };

async function renderEmployees() {
  const f = employeeFilters;
  view.innerHTML = `
    <section class="card">
      <h2>Employees</h2>
      <form class="inline" id="employee-filters">
        <label>Search <input name="search" value="${esc(f.search)}" placeholder="Name, email or code" data-testid="employee-search"></label>
        <label>Department
          <select name="department" data-testid="employee-department-filter">
            ${['', 'Engineering', 'Executive', 'Finance', 'Human Resources', 'Operations', 'Sales']
              .map((d) => `<option value="${d}" ${d === f.department ? 'selected' : ''}>${d || 'All'}</option>`).join('')}
          </select>
        </label>
        <label>Status
          <select name="status" data-testid="employee-status-filter">
            ${['', 'active', 'inactive']
              .map((s) => `<option value="${s}" ${s === f.status ? 'selected' : ''}>${s || 'All'}</option>`).join('')}
          </select>
        </label>
        <button type="submit" data-testid="employee-search-submit">Filter</button>
      </form>
      <div id="employee-results"><p class="muted">Loading…</p></div>
    </section>`;

  document.getElementById('employee-filters').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.target;
    Object.assign(f, { search: form.search.value, department: form.department.value, status: form.status.value, page: 1 });
    renderEmployees();
  });

  const params = new URLSearchParams({ page: f.page, pageSize: 15 });
  for (const key of ['search', 'department', 'status']) if (f[key]) params.set(key, f[key]);
  const { data, total, page, pageSize } = await api(`/employees?${params}`);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  document.getElementById('employee-results').innerHTML = `
    <table data-testid="employee-table">
      <thead><tr><th>Code</th><th>Name</th><th>Email</th><th>Department</th><th>Title</th><th>Grade</th><th>Status</th></tr></thead>
      <tbody>
        ${data.map((e) => `
          <tr data-testid="employee-row" data-employee-code="${esc(e.employeeCode)}">
            <td>${esc(e.employeeCode)}</td><td>${esc(e.firstName)} ${esc(e.lastName)}</td><td>${esc(e.email)}</td>
            <td>${esc(e.department)}</td><td>${esc(e.jobTitle)}</td><td>${esc(e.salaryStructureCode)}</td><td>${esc(e.status)}</td>
          </tr>`).join('') || '<tr><td colspan="7" class="muted">No employees match.</td></tr>'}
      </tbody>
    </table>
    <div class="pager">
      <span data-testid="employee-count">${total} employees</span>
      <span>
        <button id="prev" ${page <= 1 ? 'disabled' : ''} data-testid="employee-prev">Previous</button>
        <span data-testid="employee-page">Page ${page} of ${pages}</span>
        <button id="next" ${page >= pages ? 'disabled' : ''} data-testid="employee-next">Next</button>
      </span>
    </div>`;
  document.getElementById('prev').onclick = () => { f.page--; renderEmployees(); };
  document.getElementById('next').onclick = () => { f.page++; renderEmployees(); };
}

async function renderPayroll() {
  const now = new Date();
  view.innerHTML = `
    <section class="card">
      <h2>Run payroll</h2>
      <form class="inline" id="run-form" data-testid="run-payroll-form">
        <label>Year <input name="year" type="number" min="2000" max="2100" value="${now.getFullYear()}" data-testid="run-year"></label>
        <label>Month
          <select name="month" data-testid="run-month">
            ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i === now.getMonth() ? 'selected' : ''}>${i + 1}</option>`).join('')}
          </select>
        </label>
        <button type="submit" data-testid="run-submit">Run payroll</button>
      </form>
      <p id="run-message" data-testid="run-message" hidden></p>
    </section>
    <section class="card">
      <h2>Payroll runs</h2>
      <div id="runs"><p class="muted">Loading…</p></div>
    </section>`;

  document.getElementById('run-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const message = document.getElementById('run-message');
    try {
      const run = await api('/payroll-runs', {
        method: 'POST',
        body: JSON.stringify({ year: Number(form.year.value), month: Number(form.month.value) }),
      });
      message.className = 'success';
      message.textContent = `Payroll ${period(run.year, run.month)} completed for ${run.employeeCount} employees.`;
      await loadRuns();
    } catch (err) {
      message.className = 'error';
      message.textContent = err.message;
    }
    message.hidden = false;
  });

  await loadRuns();
}

async function loadRuns() {
  const runs = await api('/payroll-runs');
  document.getElementById('runs').innerHTML = runs.length ? `
    <table data-testid="payroll-runs-table">
      <thead><tr><th>Period</th><th class="num">Employees</th><th class="num">Gross</th><th class="num">Deductions</th><th class="num">Net</th><th>Run by</th><th></th></tr></thead>
      <tbody>
        ${runs.map((r) => `
          <tr data-testid="payroll-run-row" data-period="${period(r.year, r.month)}">
            <td>${period(r.year, r.month)}</td><td class="num">${r.employeeCount}</td>
            <td class="num">${money(r.totalGross)}</td><td class="num">${money(r.totalDeductions)}</td><td class="num">${money(r.totalNet)}</td>
            <td>${esc(r.createdBy)}</td><td><a href="#/payslips?run=${r.id}" data-testid="view-run-payslips">Payslips</a></td>
          </tr>`).join('')}
      </tbody>
    </table>` : '<p class="muted" data-testid="no-runs">No payroll has been run yet.</p>';
}

async function renderPayslips(query) {
  const runId = query.get('run');
  const slips = await api(`/payslips${runId ? `?payrollRunId=${encodeURIComponent(runId)}` : ''}`);
  view.innerHTML = `
    <section class="card">
      <h2>Payslips${runId && slips[0] ? ` for ${period(slips[0].year, slips[0].month)}` : ''}</h2>
      ${slips.length ? `
        <table data-testid="payslips-table">
          <thead><tr><th>Period</th><th>Code</th><th>Employee</th><th class="num">Gross</th><th class="num">Deductions</th><th class="num">Net</th><th></th></tr></thead>
          <tbody>
            ${slips.map((p) => `
              <tr data-testid="payslip-row" data-employee-code="${esc(p.employeeCode)}">
                <td>${period(p.year, p.month)}</td><td>${esc(p.employeeCode)}</td><td>${esc(p.employeeName)}</td>
                <td class="num">${money(p.grossPay)}</td><td class="num">${money(p.totalDeductions)}</td><td class="num">${money(p.netPay)}</td>
                <td><a href="#/payslips/${p.id}" data-testid="view-payslip">View</a></td>
              </tr>`).join('')}
          </tbody>
        </table>` : '<p class="muted" data-testid="no-payslips">No payslips yet.</p>'}
    </section>`;
}

async function renderPayslip(id) {
  const p = await api(`/payslips/${encodeURIComponent(id)}`);
  const row = (label, amount, testid) =>
    `<tr><td>${label}</td><td class="num" data-testid="${testid}">${money(amount)}</td></tr>`;
  view.innerHTML = `
    <section class="card" data-testid="payslip">
      <h2>Payslip ${period(p.year, p.month)}</h2>
      <p>
        <strong data-testid="payslip-employee-name">${esc(p.employeeName)}</strong>
        (<span data-testid="payslip-employee-code">${esc(p.employeeCode)}</span>)<br>
        <span class="muted">${esc(p.jobTitle)}, ${esc(p.department)}</span>
      </p>
      <div class="payslip-grid">
        <table>
          <thead><tr><th>Earnings</th><th class="num">Amount</th></tr></thead>
          <tbody>
            ${row('Basic salary', p.basicSalary, 'payslip-basic')}
            ${row('Housing allowance', p.housingAllowance, 'payslip-housing')}
            ${row('Transport allowance', p.transportAllowance, 'payslip-transport')}
            <tr class="total"><td>Gross pay</td><td class="num" data-testid="payslip-gross">${money(p.grossPay)}</td></tr>
          </tbody>
        </table>
        <table>
          <thead><tr><th>Deductions</th><th class="num">Amount</th></tr></thead>
          <tbody>
            ${row('Pension', p.pension, 'payslip-pension')}
            ${row('Income tax', p.incomeTax, 'payslip-tax')}
            <tr class="total"><td>Total deductions</td><td class="num" data-testid="payslip-deductions">${money(p.totalDeductions)}</td></tr>
          </tbody>
        </table>
      </div>
      <h3>Net pay: <span data-testid="payslip-net">${money(p.netPay)}</span></h3>
      <a href="#/payslips">Back to payslips</a>
    </section>`;
}

// ---- Router ----------------------------------------------------------------

async function route() {
  const [path, queryString] = location.hash.slice(1).split('?');
  const query = new URLSearchParams(queryString);
  const user = session.user;

  const nav = document.getElementById('nav');
  nav.hidden = !user;
  if (user) {
    document.getElementById('current-user').textContent = `${user.username} (${user.role})`;
    nav.querySelectorAll('[data-role="admin"]').forEach((a) => { a.hidden = user.role !== 'admin'; });
    nav.querySelectorAll('a').forEach((a) => a.classList.toggle('active', path.startsWith(a.getAttribute('href').slice(1))));
  }

  if (!user) {
    if (path !== '/login') location.hash = '#/login';
    else renderLogin();
    return;
  }

  try {
    if (path === '/employees' && user.role === 'admin') await renderEmployees();
    else if (path === '/payroll' && user.role === 'admin') await renderPayroll();
    else if (path === '/payslips') await renderPayslips(query);
    else if (path.startsWith('/payslips/')) await renderPayslip(path.split('/')[2]);
    else location.hash = user.role === 'admin' ? '#/employees' : '#/payslips';
  } catch (err) {
    view.innerHTML = `<p class="card error" data-testid="page-error">${esc(err.message)}</p>`;
  }
}

document.getElementById('logout').addEventListener('click', () => {
  session.clear();
  location.hash = '#/login';
});
window.addEventListener('hashchange', route);
route();
