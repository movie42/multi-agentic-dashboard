import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no canvas and logs "not implemented" for every getContext call; code that paints falls back on null.
HTMLCanvasElement.prototype.getContext = () => null;

afterEach(() => {
  cleanup();
});
