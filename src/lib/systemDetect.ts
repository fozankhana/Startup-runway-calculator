export interface SystemSpecs {
  gpuName: string
  gpuVRAM: number | null
  ramGB: number | null
  cpuCores: number
}

// Each entry: [regex to match GPU string, VRAM in GB]
const VRAM_MAP: Array<[RegExp, number]> = [
  // NVIDIA RTX 40xx
  [/4090/i, 24],
  [/4080\s*super/i, 16], [/4080/i, 16],
  [/4070\s*ti\s*super/i, 16], [/4070\s*ti/i, 12],
  [/4070\s*super/i, 12], [/4070/i, 12],
  [/4060\s*ti/i, 8], [/4060/i, 8],
  // NVIDIA RTX 30xx
  [/3090\s*ti/i, 24], [/3090/i, 24],
  [/3080\s*ti/i, 12], [/3080.*12/i, 12], [/3080/i, 10],
  [/3070\s*ti/i, 8], [/3070/i, 8],
  [/3060\s*ti/i, 8], [/3060.*12/i, 12], [/3060/i, 8],
  // NVIDIA RTX 20xx
  [/2080\s*ti/i, 11], [/2080\s*super/i, 8], [/2080/i, 8],
  [/2070\s*super/i, 8], [/2070/i, 8],
  [/2060\s*super/i, 8], [/2060/i, 6],
  // NVIDIA GTX 16xx
  [/1660\s*ti/i, 6], [/1660\s*super/i, 6], [/1660/i, 6],
  [/1650\s*super/i, 4], [/1650/i, 4],
  // NVIDIA GTX 10xx
  [/1080\s*ti/i, 11], [/1080/i, 8],
  [/1070\s*ti/i, 8], [/1070/i, 8],
  [/1060.*6/i, 6], [/1060/i, 3],
  [/1050\s*ti/i, 4], [/1050/i, 2],
  // AMD RX 7000
  [/7900\s*xtx/i, 24], [/7900\s*xt/i, 20], [/7900\s*gre/i, 16],
  [/7800\s*xt/i, 16], [/7700\s*xt/i, 12],
  [/7600\s*xt/i, 16], [/7600/i, 8],
  // AMD RX 6000
  [/6950\s*xt/i, 16], [/6900\s*xt/i, 16],
  [/6800\s*xt/i, 16], [/6800/i, 16],
  [/6750\s*xt/i, 12], [/6700\s*xt/i, 12], [/6700/i, 10],
  [/6650\s*xt/i, 8], [/6600\s*xt/i, 8], [/6600/i, 8],
  [/6500\s*xt/i, 4],
  // Intel Arc
  [/arc\s*a770/i, 16], [/arc\s*a750/i, 8], [/arc\s*a580/i, 8],
  [/arc\s*a380/i, 6], [/arc\s*a310/i, 4],
  // Apple Silicon (unified memory counts as VRAM)
  [/m3\s*ultra/i, 192], [/m3\s*max/i, 96], [/m3\s*pro/i, 36], [/apple m3\b/i, 16],
  [/m2\s*ultra/i, 192], [/m2\s*max/i, 96], [/m2\s*pro/i, 32], [/apple m2\b/i, 16],
  [/m1\s*ultra/i, 128], [/m1\s*max/i, 64], [/m1\s*pro/i, 32], [/apple m1\b/i, 16],
]

export function detectSystemSpecs(): SystemSpecs {
  let gpuName = 'Unknown GPU'
  let gpuVRAM: number | null = null

  try {
    const canvas = document.createElement('canvas')
    const gl = (
      canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')
    ) as WebGLRenderingContext | null
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      if (ext) {
        const raw = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string
        // Strip ANGLE wrapper: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)"
        gpuName = raw
          .replace(/^ANGLE\s*\(\s*/i, '')
          .replace(/\)\s*$/, '')
          .replace(/,?\s*(Direct3D\d*|OpenGL|Metal|Vulkan)[^,]*/gi, '')
          .replace(/,\s*$/, '')
          .trim()
        for (const [pattern, vram] of VRAM_MAP) {
          if (pattern.test(raw)) { gpuVRAM = vram; break }
        }
      }
    }
  } catch { /* ignore WebGL errors */ }

  return {
    gpuName,
    gpuVRAM,
    ramGB: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
    cpuCores: navigator.hardwareConcurrency ?? 0,
  }
}

// Returns the best Ollama model name for the given VRAM amount
export function recommendModelForVRAM(vram: number | null): string {
  const v = vram ?? 4
  if (v >= 24) return 'deepseek-r1:32b'
  if (v >= 12) return 'deepseek-r1:14b'
  if (v >= 8)  return 'mistral-nemo'
  if (v >= 6)  return 'qwen2.5:7b'
  if (v >= 4)  return 'qwen2.5:3b'
  return 'llama3.2:1b'
}

// Classify model size relative to available VRAM
export type VRAMFit = 'fits' | 'partial' | 'cpu' | 'unknown'

export function getVRAMFit(modelVRAM: number, gpuVRAM: number | null): VRAMFit {
  if (!gpuVRAM) return 'unknown'
  if (modelVRAM <= gpuVRAM) return 'fits'
  if (modelVRAM <= gpuVRAM * 2.5) return 'partial'
  return 'cpu'
}
