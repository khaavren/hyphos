import type {
  BackendKind,
  BackendPreference,
  IRenderer,
} from "./IRenderer";
import { WebGL2Renderer } from "./webgl2/WebGL2Renderer";
import { WebGPURenderer } from "./webgpu/WebGPURenderer";

export type RendererSelection = {
  renderer: IRenderer;
  backend: BackendKind;
  warning?: string;
};

export const selectRenderer = async (
  preference: BackendPreference,
): Promise<RendererSelection> => {
  if (preference === "webgl2") {
    return { renderer: new WebGL2Renderer(), backend: "webgl2" };
  }

  const webgpuSupported =
    typeof navigator !== "undefined" && "gpu" in navigator;

  if (webgpuSupported) {
    const webgpu = await WebGPURenderer.create();
    if (webgpu) {
      return { renderer: webgpu, backend: "webgpu" };
    }
  }

  if (preference === "webgpu") {
    return {
      renderer: new WebGL2Renderer(),
      backend: "webgl2",
      warning: "WebGPU unavailable. Falling back to WebGL2.",
    };
  }

  return { renderer: new WebGL2Renderer(), backend: "webgl2" };
};
