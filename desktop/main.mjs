import { app, BrowserWindow, dialog, globalShortcut, shell } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const PORT = Number(process.env.AGENT_CONTROL_PORT ?? 3199);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SUMMON_SHORTCUT = "Control+Alt+Space";
const EXTRA_PATH = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];

let serverProcess = null;
let mainWindow = null;

function ping() {
  return new Promise((resolve) => {
    const request = http.get(`${ORIGIN}/`, (response) => {
      response.resume();
      resolve(response.statusCode !== undefined && response.statusCode < 500);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1500, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await ping()) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

function startServer() {
  const serverDir = path.join(import.meta.dirname, "server");
  const userData = app.getPath("userData");
  fs.mkdirSync(userData, { recursive: true });
  const log = fs.createWriteStream(path.join(userData, "server.log"), { flags: "a" });

  serverProcess = spawn(process.execPath, [path.join(serverDir, "server.js")], {
    cwd: serverDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      PATH: [...EXTRA_PATH, process.env.PATH ?? ""].join(":"),
      AGENT_CONTROL_CACHE_DIR: userData,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout.pipe(log);
  serverProcess.stderr.pipe(log);
  serverProcess.on("exit", (code) => {
    console.log("[agent-control] server exited", code);
    serverProcess = null;
  });
}

function isInternal(url) {
  return url.startsWith(ORIGIN);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 600,
    title: "Agent Control",
    show: false,
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isInternal(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("page-title-updated", (_event, title) => {
    const count = title.match(/^\((\d+)\)/)?.[1];
    app.dock?.setBadge(count ?? "");
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.loadURL(ORIGIN);
}

function focusFirstCard() {
  mainWindow?.webContents
    .executeJavaScript(
      'if (!document.activeElement || document.activeElement === document.body) document.querySelector("[data-card]")?.focus();',
    )
    .catch((error) => console.warn("[agent-control] focus card", error));
}

function toggleWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isFocused() && mainWindow.isVisible()) {
    app.hide();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  app.focus({ steal: true });
  mainWindow.focus();
  focusFirstCard();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return createWindow();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    if (!(await ping())) startServer();
    const ready = await waitForServer(30_000);
    if (!ready) {
      dialog.showErrorBox(
        "Agent Control",
        `대시보드 서버를 시작하지 못했어요. 로그: ${path.join(app.getPath("userData"), "server.log")}`,
      );
      app.quit();
      return;
    }
    createWindow();
    if (!globalShortcut.register(SUMMON_SHORTCUT, toggleWindow)) {
      console.warn("[agent-control] could not register", SUMMON_SHORTCUT);
    }
  });

  app.on("will-quit", () => globalShortcut.unregisterAll());

  app.on("activate", () => {
    if (!mainWindow && app.isReady()) createWindow();
  });

  app.on("before-quit", () => {
    if (serverProcess) serverProcess.kill();
  });
}
