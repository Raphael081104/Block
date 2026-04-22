import { execSync } from 'node:child_process';

export function detectGpu() {
  // Check NVIDIA GPU (CUDA)
  try {
    const output = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader', {
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const gpu = output.toString().trim();
    if (gpu) {
      return { available: true, type: 'cuda', name: gpu };
    }
  } catch {}

  return { available: false, type: 'cpu', name: 'CPU only' };
}
