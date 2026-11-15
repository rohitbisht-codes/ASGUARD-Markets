import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, '../data.json');
export const STARTING_CASH = 100000;
const fresh = () => ({ cash: STARTING_CASH, holdings: {}, orders: [], trades: [], realizedPnl: 0, createdAt: new Date().toISOString() });
let accounts;
function load() {
  if (accounts) return accounts;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Migrate the old single-account format without discarding its history.
    accounts = parsed.accounts && typeof parsed.accounts === 'object'
      ? parsed.accounts
      : { legacy: parsed && typeof parsed === 'object' ? { ...fresh(), ...parsed } : fresh() };
  } catch { accounts = {}; }
  return accounts;
}
export function getState(accountId) {
  const db = load();
  if (!db[accountId]) db[accountId] = fresh();
  return db[accountId];
}
export function saveState() {
  const db = load();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 2, accounts: db }, null, 2));
  fs.renameSync(tmp, file);
}
export function resetState(accountId) {
  load()[accountId] = fresh();
  saveState();
  return getState(accountId);
}
export function accountCount() { return Object.keys(load()).length; }
