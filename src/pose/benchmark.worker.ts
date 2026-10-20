// Worker (tipo module) para comprobar si MediaPipe funciona fuera del hilo principal.
import { benchmarkPose, type PoseBenchmarkResult } from './benchmark.ts'
import type { PoseDelegate, PoseModel } from './landmarker.ts'

export interface BenchmarkRequest {
  images: ImageBitmap[]
  timestampsMs: number[]
  model: PoseModel
  delegate: PoseDelegate
}

export type BenchmarkResponse =
  | { ok: true; result: PoseBenchmarkResult; moduleWasm: boolean }
  | { ok: false; error: string }

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

self.onmessage = async (event: MessageEvent<BenchmarkRequest>) => {
  const { images, timestampsMs, model, delegate } = event.data
  let response: BenchmarkResponse
  try {
    // En un Worker module no existe importScripts: se prueba primero la variante ES
    // module del WASM de MediaPipe y, si falla, la normal.
    try {
      const result = await benchmarkPose(images, timestampsMs, { model, delegate, moduleWasm: true })
      response = { ok: true, result, moduleWasm: true }
    } catch (moduleError) {
      try {
        const result = await benchmarkPose(images, timestampsMs, { model, delegate })
        response = { ok: true, result, moduleWasm: false }
      } catch (classicError) {
        response = {
          ok: false,
          error: `WASM module: ${errorText(moduleError)} · WASM normal: ${errorText(classicError)}`,
        }
      }
    }
  } finally {
    for (const image of images) image.close()
  }
  self.postMessage(response)
}
