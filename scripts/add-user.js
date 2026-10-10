// Adds or updates a user in the local user store (only used when AUTH_MODE=local).
// Usage: npm run add-user -- <username/email> [firstName] [lastName]
// The password is prompted for so it never lands in shell history.
import { readFile, writeFile } from 'node:fs/promises';
import readline from 'node:readline';
import { hashPassword } from '../src/auth/local-users.js';

const [username, firstName = '', lastName = ''] = process.argv.slice(2);
if (!username) {
  console.error('Usage: npm run add-user -- <username/email> [firstName] [lastName]');
  process.exit(1);
}
const file = process.env.USERS_FILE || 'users.json';

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.startsWith(question)) rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.output.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

const password = await promptHidden('Password: ');
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}
if ((await promptHidden('Confirm password: ')) !== password) {
  console.error('Passwords do not match. Nothing was saved.');
  process.exit(1);
}

let data = { users: [] };
try {
  data = JSON.parse(await readFile(file, 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}

const record = { username, email: username, firstName, lastName, passwordHash: await hashPassword(password) };
const i = data.users.findIndex((u) => u.username.toLowerCase() === username.toLowerCase());
if (i > -1) data.users[i] = record;
else data.users.push(record);

await writeFile(file, JSON.stringify(data, null, 2) + '\n');
console.log(`${i > -1 ? 'Updated' : 'Added'} ${username} in ${file}`);
