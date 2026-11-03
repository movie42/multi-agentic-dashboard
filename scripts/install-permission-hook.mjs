import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const SETTINGS = process.env.CLAUDE_SETTINGS_FILE ?? path.join(homedir(), ".claude", "settings.json");
const HOOK_PATH = "/api/hooks/permission";

const args = process.argv.slice(2);
const uninstall = args.includes("--uninstall");
const portIndex = args.indexOf("--port");
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 3199;
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`invalid --port ${args[portIndex + 1]}`);

const settings = existsSync(SETTINGS) ? JSON.parse(readFileSync(SETTINGS, "utf8")) : {};
const hooks = settings.hooks ?? {};
const groups = Array.isArray(hooks.PermissionRequest) ? hooks.PermissionRequest : [];

const isOurs = (hook) => hook?.type === "http" && typeof hook.url === "string" && hook.url.endsWith(HOOK_PATH);
const kept = groups
  .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((hook) => !isOurs(hook)) }))
  .filter((group) => group.hooks.length > 0);

if (!uninstall) {
  kept.push({
    matcher: "*",
    hooks: [
      {
        type: "http",
        url: `http://127.0.0.1:${port}${HOOK_PATH}`,
        timeout: 600,
        headers: { "X-Orca-Pane": "$ORCA_PANE_KEY" },
        allowedEnvVars: ["ORCA_PANE_KEY"],
      },
    ],
  });
}

if (kept.length > 0) hooks.PermissionRequest = kept;
else delete hooks.PermissionRequest;
if (Object.keys(hooks).length > 0) settings.hooks = hooks;
else delete settings.hooks;

if (existsSync(SETTINGS)) {
  const backup = `${SETTINGS}.bak-${Date.now()}`;
  copyFileSync(SETTINGS, backup);
  console.log(`backup ${backup}`);
}
writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
console.log(uninstall ? `removed permission hook from ${SETTINGS}` : `installed permission hook → 127.0.0.1:${port} in ${SETTINGS}`);
