/** Shared types for the transcription pipeline. */

export type Language = 'he' | 'en'

/** Model size tiers, from smallest download to best quality. */
export type Tier = 'fast' | 'balanced' | 'accurate'

export type Backend = 'webgpu' | 'wasm' | 'cuda' | 'cpu'

/** One contiguous stretch of transcript. */
export interface Segment {
  /** Seconds from the start of the recording. */
  start: number
  end: number
  text: string
  /** Global speaker index, 0-based. Absent when diarization is off. */
  speaker?: number
}

/** A stretch of audio attributed to one speaker, before transcription. */
export interface SpeakerTurn {
  start: number
  end: number
  /** Global speaker index assigned by clustering. */
  speaker: number
}

export interface TranscriptResult {
  segments: Segment[]
  language: Language
  /** Number of distinct speakers found, 0 when diarization was off. */
  speakerCount: number
  /** Total audio duration in seconds. */
  duration: number
  /** Wall-clock seconds the run took. */
  elapsed: number
}

export type ProgressStage =
  | 'decoding'
  | 'loading-models'
  | 'diarizing'
  | 'transcribing'
  | 'done'

export interface Progress {
  stage: ProgressStage
  /** 0..1 within the current stage, or undefined when indeterminate. */
  ratio?: number
  message?: string
  /** Bytes downloaded so far for the current file, when loading models. */
  loaded?: number
  total?: number
  file?: string
}

export interface RunOptions {
  language: Language
  tier: Tier
  diarize: boolean
  backend?: Backend
  /** Cosine-distance threshold for speaker clustering. Harness tuning knob. */
  clusterThreshold?: number
  /** Forces a known number of speakers instead of inferring one. */
  numSpeakers?: number
  onProgress?: (p: Progress) => void
  /** Emitted as each work unit finishes, so the UI can grow the transcript. */
  onSegment?: (s: Segment) => void
  signal?: AbortSignal
}
