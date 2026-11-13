"use client";

import { useEffect, useRef, useState } from "react";
import { readVoice, toggleVoice } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";

type VoiceState =
  | { kind: "idle" }
  | { kind: "recording"; transcript: string }
  | { kind: "pending"; recording: boolean; transcript: string };

const POLL_MS = 400;

export function useVoice(terminalHandle: string, onTranscript: (transcript: string) => void) {
  const [state, setState] = useState<VoiceState>({ kind: "idle" });
  const recording = state.kind === "recording" || (state.kind === "pending" && state.recording);
  const polling = state.kind === "recording";
  const deliver = useRef(onTranscript);

  useEffect(() => {
    deliver.current = onTranscript;
  });

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
    const transcript = state.kind === "recording" ? state.transcript : "";
    setState({ kind: "pending", recording, transcript });
    try {
      const result = await toggleVoice(terminalHandle);
      if (result.recording) {
        setState({ kind: "recording", transcript: "" });
        return;
      }
      if (result.transcript) deliver.current(result.transcript);
      setState({ kind: "idle" });
    } catch (error) {
      toastError("voice", error);
      setState({ kind: "idle" });
    }
  };

  const stop = async (): Promise<string | null> => {
    if (state.kind !== "recording") return null;
    setState({ kind: "pending", recording: true, transcript: state.transcript });
    try {
      const result = await toggleVoice(terminalHandle, "stop");
      if (result.recording) {
        setState({ kind: "recording", transcript: "" });
        return null;
      }
      setState({ kind: "idle" });
      return result.transcript;
    } catch (error) {
      toastError("voice", error);
      setState({ kind: "idle" });
      return null;
    }
  };

  return {
    recording,
    pending: state.kind === "pending",
    transcript: state.kind === "idle" ? "" : state.transcript,
    toggle,
    stop,
  };
}
