import { Pool, types } from 'pg';
import { config } from './config';

// Return NUMERIC columns as JS numbers instead of strings. Amounts in this app
// stay well within the range a double represents exactly to the cent.
types.setTypeParser(types.builtins.NUMERIC, (value) => Number(value));
// Return DATE columns as 'YYYY-MM-DD' strings to avoid timezone shifts.
types.setTypeParser(types.builtins.DATE, (value) => value);

export const pool = new Pool({ connectionString: config.databaseUrl });
