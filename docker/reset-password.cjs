// Forgot the password: removes ALL accounts and signs everyone out. Then open OhmzBudget:
// the next visit starts fresh setup (a new account), with a new setup code in the server log.
//   docker exec ohmzbudget node reset-password.cjs
const Database = require('better-sqlite3');

const db = new Database(process.env.DB_PATH, { fileMustExist: true });
// service_tokens are a separate auth domain and stay: revoking a token is an explicit action.
// Removing auth_config also makes the next boot mint a fresh device-cookie secret.
db.exec('DELETE FROM users; DELETE FROM sessions; DELETE FROM auth_config;');
db.close();
console.log(
  'All accounts removed. Open OhmzBudget in your browser to set up a new account, then run ' +
    '`docker logs ohmzbudget` to get the setup code it asks for.',
);
