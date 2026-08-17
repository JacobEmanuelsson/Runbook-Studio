import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const playwrightBin = path.join(root, "node_modules", "playwright", "cli.js");
const url = "http://127.0.0.1:3000";

let server = null;

if (!(await isServerReady())) {
  server = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", "3000"], {
    cwd: root,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      FORCE_COLOR: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", (chunk) => process.stdout.write(`[server] ${chunk}`));
  server.stderr.on("data", (chunk) => process.stderr.write(`[server] ${chunk}`));

  await waitForServer();
}

const testCode = await runPlaywright();

if (server?.pid) {
  await stopProcessTree(server.pid);
}

process.exit(testCode);

async function runPlaywright() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [playwrightBin, "test"], {
      cwd: root,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
      },
      stdio: "inherit",
    });

    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await isServerReady()) {
      return;
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function isServerReady() {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

async function stopProcessTree(pid) {
  if (process.platform !== "win32") {
    process.kill(pid, "SIGTERM");
    return;
  }

  await new Promise((resolve) => {
    const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
    });

    killer.on("exit", resolve);
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
