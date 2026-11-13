"use client";

import { useEffect, useState } from "react";
import { readVoice, toggleVoice } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";

type VoiceState = { kind: "idle" } | { kind: "recording"; transcript: string } | { kind: "pending"; recording: boolean };

const POLL_MS = 400;

export function useVoice(terminalHandle: string) {
  const [state, setState] = useState<VoiceState>({ kind: "idle" });
  const recording = state.kind === "recording" || (state.kind === "pending" && state.recording);
  const polling = state.kind === "recording";

  useEffect(() => {
    if (!polling) return;
    const loop: { cancelled: boolean; timer?: ReturnType<typeof setTimeout> } = { cancelled: false };
    const poll = async () => {
      try {
        const voice = await readVoice(terminalHandle);
        if (loop.cancelled) return;
        setState((current) => {
          if (current.kind !== "recording") return current;
          return voice.recording ? { kind: "recording", transcript: voice.transcript } : { kind: "idle" };
        });
      } catch (error) {
        console.warn("[voice] read failed", error);
      }
      if (!loop.cancelled) loop.timer = setTimeout(poll, POLL_MS);
    };
    loop.timer = setTimeout(poll, POLL_MS);
    return () => {
      loop.cancelled = true;
      clearTimeout(loop.timer);
    };
  }, [polling, terminalHandle]);

  const toggle = async () => {
    if (state.kind === "pending") return;
    setState({ kind: "pending", recording });
    try {
      setState((await toggleVoice(terminalHandle)) ? { kind: "recording", transcript: "" } : { kind: "idle" });
    } catch (error) {
      toastError("voice", error);
      setState({ kind: "idle" });
    }
  };

  return {
    recording,
    pending: state.kind === "pending",
    transcript: state.kind === "recording" ? state.transcript : "",
    toggle,
  };
}
