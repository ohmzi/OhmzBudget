// Forgot the password: removes it and signs everyone out. Then open OhmzBudget: it
// asks for a new password and a new setup code, printed in the server log.
//   docker exec ohmzbudget node reset-password.cjs
const Database = require('better-sqlite3');

const db = new Database(process.env.DB_PATH, { fileMustExist: true });
db.exec('DELETE FROM sessions; DELETE FROM auth_config;');
db.close();
console.log(
  'Password removed. Open OhmzBudget in your browser, then run `docker logs ohmzbudget` ' +
    'to get the setup code it asks for.',
);
