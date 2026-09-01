/**
 * Pure clustering helpers for speaker diarization. Kept separate from any model
 * call so they can be unit tested without downloading weights.
 */

/** L2-normalises a vector in place and returns it. */
export function normalise(v: Float32Array): Float32Array {
  let sum = 0
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i]
  const norm = Math.sqrt(sum) || 1
  for (let i = 0; i < v.length; i++) v[i] /= norm
  return v
}

/** Cosine distance in [0, 2]. Assumes both inputs are L2-normalised. */
export function cosineDistance(a: Float32Array, b: Float32Array): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return 1 - dot
}

function centroidOf(vectors: Float32Array[], members: number[]): Float32Array {
  const dim = vectors[0].length
  const out = new Float32Array(dim)
  for (const m of members) {
    const v = vectors[m]
    for (let i = 0; i < dim; i++) out[i] += v[i]
  }
  for (let i = 0; i < dim; i++) out[i] /= members.length
  return normalise(out)
}

export interface ClusterOptions {
  /** Merge clusters whose centroids are closer than this cosine distance. */
  threshold: number
  /** Hard cap on speakers. Merging continues past the threshold to reach it. */
  maxSpeakers?: number
  /** Forces exactly this many clusters, ignoring the threshold. */
  numSpeakers?: number
}

/**
 * Agglomerative clustering with centroid linkage over cosine distance, the same
 * shape pyannote uses. Inputs are expected to be L2-normalised.
 *
 * Returns a cluster index per input vector, renumbered so that cluster 0 is the
 * one that appears first in the input order.
 */
export function agglomerativeCluster(
  vectors: Float32Array[],
  { threshold, maxSpeakers = 20, numSpeakers }: ClusterOptions,
): number[] {
  const n = vectors.length
  if (n === 0) return []
  if (n === 1) return [0]

  // Each cluster is a list of member indices; centroids are recomputed on merge.
  let clusters: number[][] = vectors.map((_, i) => [i])
  let centroids: Float32Array[] = vectors.map((v) => normalise(Float32Array.from(v)))

  for (;;) {
    if (clusters.length <= 1) break
    if (numSpeakers !== undefined && clusters.length <= numSpeakers) break

    let best = Infinity
    let bestPair: [number, number] = [0, 1]
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = cosineDistance(centroids[i], centroids[j])
        if (d < best) {
          best = d
          bestPair = [i, j]
        }
      }
    }

    const overCap = clusters.length > maxSpeakers
    const forcing = numSpeakers !== undefined
    if (!forcing && !overCap && best > threshold) break

    const [i, j] = bestPair
    const merged = clusters[i].concat(clusters[j])
    clusters = clusters.filter((_, k) => k !== i && k !== j)
    centroids = centroids.filter((_, k) => k !== i && k !== j)
    clusters.push(merged)
    centroids.push(centroidOf(vectors, merged))
  }

  // Renumber by first appearance so speaker 0 is whoever spoke first.
  const labels = new Array<number>(n).fill(-1)
  clusters.forEach((members, idx) => {
    for (const m of members) labels[m] = idx
  })
  const remap = new Map<number, number>()
  for (const label of labels) {
    if (!remap.has(label)) remap.set(label, remap.size)
  }
  return labels.map((l) => remap.get(l)!)
}
