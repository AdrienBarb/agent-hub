import "server-only";
import type { Renderer } from "./types";
import {
  SandboxRenderer,
  disposeRenderSandbox,
  acquireRenderSandbox,
  releaseRenderSandbox,
} from "./sandbox";

export type { Renderer, RenderInput, RenderOutput } from "./types";
export { type AtsResult, checkAts, extractPdfText } from "./ats";
export { disposeRenderSandbox, acquireRenderSandbox, releaseRenderSandbox };

let renderer: Renderer | undefined;

/** The single rendering backend (Vercel Sandbox). */
export function getRenderer(): Renderer {
  if (!renderer) {
    renderer = new SandboxRenderer();
  }
  return renderer;
}
