/**
 * Model registry.
 *
 * Every entry here is commercially free: Apache-2.0, MIT, or CC-BY-4.0 with
 * attribution (see NOTICE). Download sizes are the sum of the encoder and
 * decoder files actually fetched at the listed dtype, measured against the Hub.
 */

import type { Backend, Language, Tier } from './types.ts'

export interface AsrModel {
  id: string
  /** Human label for the tier selector. */
  label: string
  /** Approximate download in megabytes at the WebGPU dtypes below. */
  sizeMB: number
  license: string
  /** Where the weights come from, shown in the credits. */
  source: string
  /** Per-file dtypes, keyed by backend family. */
  dtype: {
    webgpu: Record<string, string>
    wasm: Record<string, string>
  }
  /** True when the export carries cross-attentions (word-level timestamps). */
  wordTimestamps: boolean
  /**
   * Set for models trained on a single language with the multilingual
   * machinery removed. Whisper's decoder normally begins with a language token
   * and a task token; a monolingual model has neither in its vocabulary, and
   * passing them makes generation fail rather than degrade.
   */
  monolingual?: boolean
  /** Set for models that only ever produce one language. */
  onlyLanguage?: Language
  notes?: string
}

export const ASR_MODELS: Record<Language, Partial<Record<Tier, AsrModel>>> = {
  // Hebrew has two tiers. Stock whisper-base and whisper-small are still not
  // offered: benchmarked on real Hebrew speech they reach 68% and 46% word
  // error rate, so a smaller tier built on them would only be a smaller
  // download of something that does not work. The fast tier below is a Hebrew
  // model trained for this purpose instead.
  he: {
    fast: {
      id: 'itayinbar/whisper-base-he',
      label: 'Fast (Hebrew)',
      sizeMB: 101,
      license: 'Apache-2.0',
      source: 'whisper-base with a Hebrew tokenizer, trained on 3,113 hours',
      dtype: {
        webgpu: { encoder_model: 'fp16', decoder_model_merged: 'fp16' },
        wasm: { encoder_model: 'quantized', decoder_model_merged: 'quantized' },
      },
      wordTimestamps: false,
      monolingual: true,
      onlyLanguage: 'he',
      notes:
        'Five times smaller and roughly eight times faster than the accurate tier, ' +
        'at 14.9% word error rate on ivrit.ai eval-d1 against 5.5%. Good for a ' +
        'quick pass or a phone; use the accurate tier when the transcript matters.',
    },
    accurate: {
      id: 'ivrit-ai/whisper-large-v3-turbo-onnx',
      label: 'ivrit.ai Hebrew',
      sizeMB: 563,
      license: 'Apache-2.0',
      source: 'ivrit.ai Hebrew fine-tune of Whisper large-v3-turbo',
      dtype: {
        webgpu: { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' },
        wasm: { encoder_model: 'q4', decoder_model_merged: 'q4' },
      },
      wordTimestamps: false,
      onlyLanguage: 'he',
      notes: 'Hebrew-only, trained on ~5,050 hours of Hebrew by ivrit.ai.',
    },
  },
  en: {
    fast: {
      id: 'onnx-community/whisper-base_timestamped',
      label: 'Fast',
      sizeMB: 110,
      license: 'MIT',
      source: 'OpenAI Whisper base',
      dtype: {
        webgpu: { encoder_model: 'fp16', decoder_model_merged: 'q4f16' },
        wasm: { encoder_model: 'q8', decoder_model_merged: 'q8' },
      },
      wordTimestamps: true,
    },
    balanced: {
      id: 'onnx-community/whisper-small_timestamped',
      label: 'Balanced',
      sizeMB: 212,
      license: 'MIT',
      source: 'OpenAI Whisper small',
      dtype: {
        webgpu: { encoder_model: 'q4', decoder_model_merged: 'q4f16' },
        wasm: { encoder_model: 'q8', decoder_model_merged: 'q8' },
      },
      wordTimestamps: true,
    },
    accurate: {
      id: 'onnx-community/whisper-large-v3-turbo_timestamped',
      label: 'Accurate',
      sizeMB: 563,
      license: 'MIT',
      source: 'OpenAI Whisper large-v3-turbo',
      dtype: {
        webgpu: { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' },
        wasm: { encoder_model: 'q4', decoder_model_merged: 'q4' },
      },
      wordTimestamps: true,
    },
  },
}

/** The tier used when the user has not chosen one. */
export const DEFAULT_TIER: Record<Language, Tier> = { he: 'accurate', en: 'accurate' }

export const SEGMENTATION_MODEL = {
  id: 'onnx-community/pyannote-segmentation-3.0',
  sizeMB: 3,
  license: 'MIT',
  source: 'pyannote/segmentation-3.0',
}

export const EMBEDDING_MODEL = {
  id: 'onnx-community/wespeaker-voxceleb-resnet34-LM',
  sizeMB: 13,
  license: 'CC-BY-4.0',
  source: 'WeSpeaker ResNet34 trained on VoxCeleb',
}

export const TIER_ORDER: Tier[] = ['fast', 'balanced', 'accurate']

/** Tiers actually offered for a language, smallest first. */
export function availableTiers(language: Language): Tier[] {
  return TIER_ORDER.filter((t) => ASR_MODELS[language][t] !== undefined)
}

export function getAsrModel(language: Language, tier: Tier): AsrModel {
  const model = ASR_MODELS[language][tier] ?? ASR_MODELS[language][DEFAULT_TIER[language]]
  if (!model) throw new Error(`No ASR model for ${language}/${tier}`)
  return model
}

/** Picks the dtype map for a backend. cuda/cpu in Node use the wasm column. */
export function dtypeFor(model: AsrModel, backend: Backend): Record<string, string> {
  return backend === 'webgpu' ? model.dtype.webgpu : model.dtype.wasm
}

/** Total extra download when diarization is switched on. */
export const DIARIZATION_SIZE_MB = SEGMENTATION_MODEL.sizeMB + EMBEDDING_MODEL.sizeMB
