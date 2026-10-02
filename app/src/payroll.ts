/**
 * Payroll calculation rules. Pure functions, no database access.
 *
 *   gross       = basic + housing + transport
 *   pension     = basic * pensionRate / 100
 *   taxable     = gross - pension
 *   income tax  = progressive monthly brackets on taxable (see TAX_BRACKETS)
 *   deductions  = pension + income tax
 *   net         = gross - deductions
 *
 * All arithmetic is done in integer cents; each derived amount is rounded
 * half-up to the nearest cent.
 */

export interface SalaryInput {
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  pensionRate: number;
}

export interface PayslipAmounts {
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  grossPay: number;
  pension: number;
  incomeTax: number;
  totalDeductions: number;
  netPay: number;
}

/** Monthly brackets: income above `from` (up to the next bracket) is taxed at `rate`. */
export const TAX_BRACKETS = [
  { from: 0, rate: 0 },
  { from: 1000, rate: 0.1 },
  { from: 4000, rate: 0.2 },
  { from: 8000, rate: 0.3 },
] as const;

const toCents = (amount: number) => Math.round(amount * 100);
const toAmount = (cents: number) => cents / 100;

export function incomeTaxCents(taxableCents: number): number {
  let tax = 0;
  TAX_BRACKETS.forEach((bracket, i) => {
    const lower = toCents(bracket.from);
    const next = TAX_BRACKETS[i + 1];
    const upper = next ? toCents(next.from) : Infinity;
    const inBracket = Math.min(taxableCents, upper) - lower;
    if (inBracket > 0) tax += inBracket * bracket.rate;
  });
  return Math.round(tax);
}

export function calculatePayslip(s: SalaryInput): PayslipAmounts {
  const basic = toCents(s.basicSalary);
  const housing = toCents(s.housingAllowance);
  const transport = toCents(s.transportAllowance);
  const gross = basic + housing + transport;
  const pension = Math.round((basic * s.pensionRate) / 100);
  const tax = incomeTaxCents(gross - pension);
  const deductions = pension + tax;

  return {
    basicSalary: toAmount(basic),
    housingAllowance: toAmount(housing),
    transportAllowance: toAmount(transport),
    grossPay: toAmount(gross),
    pension: toAmount(pension),
    incomeTax: toAmount(tax),
    totalDeductions: toAmount(deductions),
    netPay: toAmount(gross - deductions),
  };
}
