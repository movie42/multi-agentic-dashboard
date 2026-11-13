import "server-only";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { VoiceMode } from "./voice";

export const CLAUDE_SETTINGS_FILE = process.env.CLAUDE_SETTINGS_FILE ?? path.join(homedir(), ".claude", "settings.json");

export async function readVoiceMode(file: string): Promise<VoiceMode> {
  try {
    const settings: unknown = JSON.parse(await readFile(file, "utf8"));
    if (typeof settings !== "object" || settings === null || !("voice" in settings)) return "hold";
    const { voice } = settings;
    if (typeof voice !== "object" || voice === null || !("mode" in voice)) return "hold";
    return voice.mode === "tap" ? "tap" : "hold";
  } catch (error) {
    console.warn("[voice] could not read voice mode", error);
    return "hold";
  }
}
