import { execFile } from "node:child_process";
import { app, BrowserWindow, dialog, globalShortcut, shell, utilityProcess } from "electron";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const PORT = Number(process.env.AGENT_CONTROL_PORT ?? 3199);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SUMMON_SHORTCUT = "Control+Alt+Space";
const EXTRA_PATH = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];

function readRunnerConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "runner.json"), "utf8"));
    return typeof config.node === "string" && typeof config.daemonEntry === "string"
      ? { RUNNER_NODE: config.node, RUNNER_DAEMON_ENTRY: config.daemonEntry }
      : {};
  } catch (error) {
    console.warn("[agent-control] no runner.json — the server cannot start the session runner daemon", error);
    return {};
  }
}

let serverProcess = null;
let mainWindow = null;

const APP_ID = "agent-control";

// "ours" | "other" | "none". Anything answering on the port used to count as our server, so a
// window could open another project's dev server that happened to hold the port.
function probe() {
  return new Promise((resolve) => {
    const request = http.get(`${ORIGIN}/api/health`, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body).app === APP_ID ? "ours" : "other");
        } catch {
          resolve("other");
        }
      });
    });
    request.on("error", () => resolve("none"));
    request.setTimeout(1500, () => {
      request.destroy();
      resolve("none");
    });
  });
}

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await probe();
    if (state === "ours") return "ours";
    if (state === "other" && !serverProcess) return "other";
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return (await probe()) === "ours" ? "ours" : "timeout";
}

function portHolder() {
  return new Promise((resolve) => {
    execFile("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN", "-Fpc"], (error, stdout) => {
      if (error) return resolve(null);
      const pid = stdout.match(/^p(\d+)/m)?.[1];
      const name = stdout.match(/^c(.+)/m)?.[1];
      resolve(pid ? `${name ?? "?"} (pid ${pid})` : null);
    });
  });
}

function startServer() {
  const serverDir = path.join(import.meta.dirname, "server");
  const userData = app.getPath("userData");
  fs.mkdirSync(userData, { recursive: true });
  const log = fs.createWriteStream(path.join(userData, "server.log"), { flags: "a" });

  serverProcess = utilityProcess.fork(path.join(serverDir, "server.js"), [], {
    cwd: serverDir,
    serviceName: "Agent Control Server",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      PATH: [...EXTRA_PATH, process.env.PATH ?? ""].join(":"),
      AGENT_CONTROL_CACHE_DIR: userData,
      ...readRunnerConfig(),
    },
    stdio: "pipe",
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

const APP_WINDOW = { minWidth: 900, minHeight: 600 };

function openHandler({ url }) {
  const pathname = isInternal(url) ? new URL(url).pathname : null;
  if (pathname === "/diff") {
    return { action: "allow", overrideBrowserWindowOptions: { ...APP_WINDOW, width: 1440, height: 960, title: "변경 읽기" } };
  }
  if (pathname === "/graph") {
    return { action: "allow", overrideBrowserWindowOptions: { ...APP_WINDOW, width: 1440, height: 960, title: "깃 그래프" } };
  }
  if (pathname === "/runner") {
    return { action: "allow", overrideBrowserWindowOptions: { ...APP_WINDOW, width: 1440, height: 960, title: "세션 러너" } };
  }
  // Size and position come from the window.open features of a tab dragged out of the doc panel.
  if (pathname === "/doc") {
    return { action: "allow", overrideBrowserWindowOptions: { minWidth: 480, minHeight: 400, title: "문서" } };
  }
  shell.openExternal(url);
  return { action: "deny" };
}

// Windows opened from the board get the same rules, so links inside a detached doc window still
// leave for the default browser instead of spawning bare Electron windows.
function guardContents(contents) {
  contents.setWindowOpenHandler(openHandler);
  contents.on("will-navigate", (event, url) => {
    if (!isInternal(url)) {
      event.preventDefault();
      if (url.startsWith("file:")) return;
      shell.openExternal(url);
    }
  });
  contents.on("did-create-window", (child) => guardContents(child.webContents));
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
  guardContents(mainWindow.webContents);
  // The default menu's Reload (Cmd+R) would reload the whole board; let the page reload an open
  // document instead and fall back to a full reload when nothing claims the event.
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || !input.meta || input.shift || input.alt || input.key.toLowerCase() !== "r") return;
    event.preventDefault();
    mainWindow.webContents
      .executeJavaScript(
        'if (window.dispatchEvent(new Event("agent-control:reload", { cancelable: true }))) location.reload();',
      )
      .catch((error) => console.warn("[agent-control] reload", error));
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
    if ((await probe()) !== "ours") startServer();
    const state = await waitForServer(30_000);
    if (state !== "ours") {
      const holder = state === "other" ? await portHolder() : null;
      dialog.showErrorBox(
        "Agent Control",
        state === "other"
          ? `포트 ${PORT}을 다른 프로그램${holder ? ` ${holder}` : ""}이 쓰고 있어서 대시보드 서버를 띄우지 못했어요. 그 프로그램을 끄고 다시 실행하세요.`
          : `대시보드 서버를 시작하지 못했어요. 로그: ${path.join(app.getPath("userData"), "server.log")}`,
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
