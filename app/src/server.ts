import { createApp } from './app';
import { config } from './config';

createApp().listen(config.port, () => {
  console.log(`Payroll demo app listening on http://localhost:${config.port}`);
});
