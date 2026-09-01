/** Checks the segmentation and embedding models load and produce sane shapes. */

import { AutoModel, AutoModelForAudioFrameClassification, AutoProcessor } from '@huggingface/transformers'
import { EMBEDDING_MODEL, SEGMENTATION_MODEL } from '../src/lib/models.ts'
import { decodePowerset } from '../src/lib/segments.ts'
import { decodeToPcm } from './decode.ts'

const file = process.argv[2]
const audio = await decodeToPcm(file, { offset: 10, duration: 10 })
console.log('audio samples', audio.length)

const segProcessor = await AutoProcessor.from_pretrained(SEGMENTATION_MODEL.id)
const segModel = await AutoModelForAudioFrameClassification.from_pretrained(SEGMENTATION_MODEL.id, {
  device: 'cpu',
  dtype: 'fp32',
})
const inputs = await segProcessor(audio)
console.log('seg inputs', Object.keys(inputs), inputs.input_values?.dims)
const segOut = await segModel(inputs)
console.log('seg outputs', Object.keys(segOut))
const logits = segOut.logits ?? Object.values(segOut)[0]
console.log('seg logits dims', logits.dims)
const frames = logits.tolist()[0]
const active = decodePowerset(frames)
const counts = new Map<string, number>()
for (const a of active) counts.set(a.join(','), (counts.get(a.join(',')) ?? 0) + 1)
console.log('frame label histogram', [...counts.entries()])

const embProcessor = await AutoProcessor.from_pretrained(EMBEDDING_MODEL.id)
const embModel = await AutoModel.from_pretrained(EMBEDDING_MODEL.id, { device: 'cpu', dtype: 'fp32' })
const embInputs = await embProcessor(audio.slice(0, 16000 * 3))
console.log('emb inputs', Object.keys(embInputs), embInputs.input_features?.dims)
const embOut = await embModel(embInputs)
console.log('emb outputs', Object.keys(embOut))
const vec = embOut.logits ?? embOut.embeddings ?? Object.values(embOut)[0]
console.log('emb dims', vec.dims)
