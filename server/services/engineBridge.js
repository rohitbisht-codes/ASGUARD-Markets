import { spawn } from "node:child_process";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const configuredEnginePath = process.env.ENGINE_PATH;
const executable = configuredEnginePath
  ? (path.isAbsolute(configuredEnginePath) ? configuredEnginePath : path.resolve(process.cwd(), configuredEnginePath))
  : path.resolve(here, `../../engine/matching_engine${process.platform === "win32" ? ".exe" : ""}`);
const childEnv = { ...process.env };
if (process.platform === "win32") {
  childEnv.PATH = ["C:\\msys64\\ucrt64\\bin", "C:\\msys64\\usr\\bin", childEnv.PATH || ""].join(path.delimiter);
}
const processHandle = spawn(executable, [], { stdio: ["pipe", "pipe", "inherit"], env: childEnv });
const lines = readline.createInterface({ input: processHandle.stdout });
const pending = [];
let processError = null;

lines.on("line", line => {
  const resolve = pending.shift();
  if (!resolve) return;
  try { resolve(JSON.parse(line)); }
  catch { resolve({ ok: false, error: "Matching engine returned invalid JSON" }); }
});
processHandle.on("error", error => {
  processError = error;
  while (pending.length) pending.shift()({ ok: false, error: `Could not start C++ engine: ${error.message}` });
});
processHandle.on("exit", code => {
  processError = new Error(`C++ engine exited with code ${code}`);
  while (pending.length) pending.shift()({ ok: false, error: processError.message });
});

export function engineCall(command) {
  return new Promise(resolve => {
    if (processError || processHandle.killed || !processHandle.stdin.writable) {
      resolve({ ok: false, error: processError?.message || "Matching engine is not running" });
      return;
    }
    let settled = false;
    const finish = result => { if (!settled) { settled = true; resolve(result); } };
    pending.push(finish);
    processHandle.stdin.write(command + "\n", error => {
      if (error) finish({ ok: false, error: error.message });
    });
    setTimeout(() => {
      const index = pending.indexOf(finish);
      if (index >= 0) pending.splice(index, 1);
      finish({ ok: false, error: "Matching engine response timed out" });
    }, 5000).unref();
  });
}

export function engineIsRunning() {
  return !processError && !processHandle.killed && processHandle.exitCode === null;
}
