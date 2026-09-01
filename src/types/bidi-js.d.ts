declare module 'bidi-js' {
  export interface EmbeddingLevels {
    levels: Uint8Array
    paragraphs: { start: number; end: number; level: number }[]
  }
  export interface Bidi {
    getEmbeddingLevels(text: string, direction?: 'ltr' | 'rtl' | 'auto'): EmbeddingLevels
    getReorderedString(text: string, embeddingLevels: EmbeddingLevels): string
    getReorderSegments(text: string, embeddingLevels: EmbeddingLevels): [number, number][]
    getMirroredCharacter(char: string): string | null
  }
  export default function bidiFactory(): Bidi
}
