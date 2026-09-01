# free-transcribe

Transcribe Hebrew and English recordings **entirely in your browser**. The audio
never leaves the device: the model is downloaded once, runs locally on WebGPU,
and there is no server, no account and no storage.

**Live: https://itayinbarr.github.io/free-transcribe/**

- Hebrew and English, picked by you (the picker sets the language of the audio)
- Optional speaker labelling, with stable `Speaker 1 / 2 / 3` across a whole recording
- Export as TXT, Markdown, SRT or PDF, or copy to the clipboard
- Handles long recordings: 40-minute files are the normal case, not the edge case
- MIT licensed, models are Apache-2.0 / MIT / CC-BY-4.0

## Which models it uses

Nothing is bundled. The browser fetches these from the Hugging Face CDN on first
use and caches them.

| Role | Model | Licence | Download |
|---|---|---|---|
| Hebrew | [`ivrit-ai/whisper-large-v3-turbo-onnx`](https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-onnx) | Apache-2.0 | 563 MB |
| English, accurate | [`onnx-community/whisper-large-v3-turbo_timestamped`](https://huggingface.co/onnx-community/whisper-large-v3-turbo_timestamped) | MIT | 563 MB |
| English, balanced | `onnx-community/whisper-small_timestamped` | MIT | 212 MB |
| English, fast | `onnx-community/whisper-base_timestamped` | MIT | 110 MB |
| Speaker segmentation | [`onnx-community/pyannote-segmentation-3.0`](https://huggingface.co/onnx-community/pyannote-segmentation-3.0) | MIT | 3 MB |
| Speaker embedding | [`onnx-community/wespeaker-voxceleb-resnet34-LM`](https://huggingface.co/onnx-community/wespeaker-voxceleb-resnet34-LM) | CC-BY-4.0 | 13 MB |

### Why Hebrew only has one model

Because the small ones do not work. Measured on real Hebrew speech, on the same
60-second clip:

| Model | Download | Speed | Result |
|---|---|---|---|
| whisper-base | 110 MB | 4.1x realtime | Garbled, and it fell into a repetition loop |
| whisper-small | 212 MB | 4.0x realtime | Still garbled, repeated a whole sentence |
| ivrit.ai turbo | 563 MB | 3.3x realtime | Clean and correct |

Where the tuned model produces `קודם כול, הייתי רוצה לתאר את החברה`, whisper-base
produces `כל כול הייתי הייתי רוצה לתארת החברה`. The speeds are almost identical,
so a smaller Hebrew tier would only save download size on output nobody can use.
English is different: stock Whisper is good at English, so all three tiers ship.

## How it works

1. **Decode.** The file is decoded through the Web Audio API at 16 kHz, so a
   47-minute recording becomes ~180 MB of PCM rather than ~540 MB. Containers the
   browser cannot open fall back to ffmpeg.wasm, fetched from a CDN on demand.
2. **Diarize** (optional). `pyannote/segmentation-3.0` only sees 10 seconds at a
   time and its speaker labels are local to each window, so running it once over
   a long file relabels the same person every few seconds. Instead the model is
   slid across the recording with a 5-second hop, each local speaker turn is
   embedded with WeSpeaker, and the embeddings are clustered globally. That is
   what keeps "Speaker 1" the same person from beginning to end.
3. **Transcribe.** With diarization on, each speaker turn is transcribed as its
   own unit, which gives exact attribution without needing word-level timing.
   Without it, the recording is processed in blocks so memory stays bounded and
   the transcript grows on screen as it goes.

## Requirements

WebGPU gives the practical experience: Chrome or Edge 113+, or Safari 26+. Without
it the app falls back to CPU via WebAssembly, which works but is far slower. The
563 MB model needs a desktop or a recent, well-specified phone.

Cross-origin isolation is deliberately **not** enabled: the Hugging Face CDN does
not send `Cross-Origin-Resource-Policy`, so `require-corp` would block every model
download. That rules out multi-threaded WebAssembly, which is why WebGPU matters.

## Verified

The pipeline is checked against real recordings, not synthetic clips. Three
Hebrew recordings of 47:12, 39:31 and 8:47 run end to end through
`scripts/bench.ts`, which executes exactly the code the browser runs. On CPU
alone the tuned Hebrew model reaches roughly **4.3x realtime**, so a 40-minute
recording transcribes in about ten minutes; WebGPU is considerably faster.

Alongside that: 52 unit tests over the pure pipeline logic, and 34 browser tests
covering real wav/mp3/m4a/ogg decoding, the interface at desktop and phone
viewports, and Hebrew PDF generation.

## Development

```bash
npm install
npm run dev        # local dev server
npm run typecheck  # tsc
npm test           # unit tests
npm run build      # static build into dist/
```

### Testing against real audio

`scripts/bench.ts` runs the exact pipeline from `src/lib/` under Node, so model
and tuning decisions are made against real recordings rather than guesses:

```bash
node scripts/bench.ts recording.m4a --lang he --diarize --backend cpu
node scripts/tune-diarize.ts recording.m4a   # speaker-distance histogram
```

## Licence

MIT, see [LICENSE](LICENSE). Model and font attribution is in [NOTICE](NOTICE).
Credit for the Hebrew model goes to [ivrit.ai](https://www.ivrit.ai/).
