import { describe, expect, it } from 'vitest'
import { agglomerativeCluster, cosineDistance, normalise } from '../../src/lib/cluster.ts'

const vec = (...values: number[]) => normalise(Float32Array.from(values))

describe('cosineDistance', () => {
  it('is zero for identical directions and one for orthogonal ones', () => {
    expect(cosineDistance(vec(1, 0), vec(1, 0))).toBeCloseTo(0)
    expect(cosineDistance(vec(1, 0), vec(0, 1))).toBeCloseTo(1)
  })
})

describe('agglomerativeCluster', () => {
  it('handles the empty and single-vector cases', () => {
    expect(agglomerativeCluster([], { threshold: 0.5 })).toEqual([])
    expect(agglomerativeCluster([vec(1, 0)], { threshold: 0.5 })).toEqual([0])
  })

  it('separates two well-spaced groups', () => {
    const vectors = [vec(1, 0), vec(0.98, 0.02), vec(0, 1), vec(0.02, 0.98)]
    const labels = agglomerativeCluster(vectors, { threshold: 0.5 })
    expect(labels[0]).toBe(labels[1])
    expect(labels[2]).toBe(labels[3])
    expect(labels[0]).not.toBe(labels[2])
  })

  it('merges everything when the threshold is loose', () => {
    const vectors = [vec(1, 0), vec(0, 1)]
    expect(new Set(agglomerativeCluster(vectors, { threshold: 1.5 })).size).toBe(1)
  })

  it('honours an explicit speaker count over the threshold', () => {
    const vectors = [vec(1, 0), vec(0.99, 0.01), vec(0, 1)]
    const labels = agglomerativeCluster(vectors, { threshold: 0.01, numSpeakers: 2 })
    expect(new Set(labels).size).toBe(2)
  })

  it('numbers clusters by first appearance', () => {
    const vectors = [vec(0, 1), vec(1, 0), vec(0.01, 0.99)]
    const labels = agglomerativeCluster(vectors, { threshold: 0.5 })
    expect(labels[0]).toBe(0)
    expect(labels[1]).toBe(1)
    expect(labels[2]).toBe(0)
  })

  it('respects the maximum speaker cap', () => {
    const vectors = [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)]
    const labels = agglomerativeCluster(vectors, { threshold: 0.01, maxSpeakers: 2 })
    expect(new Set(labels).size).toBeLessThanOrEqual(2)
  })
})
