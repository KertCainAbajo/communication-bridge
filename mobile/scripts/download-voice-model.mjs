// Downloads the offline Filipino (Tagalog) and Bisaya (Cebuano) voices bundled inside the Android app.
// Models: Meta MMS-TTS (CC-BY-NC 4.0, non-commercial use only), converted to ONNX for sherpa-onnx.
// Usage: node scripts/download-voice-model.mjs
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const baseUrl = 'https://huggingface.co/willwade/mms-tts-multilingual-models-onnx/resolve/main';
const modelsDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'native-assets', 'models');
const voices = { tgl: 'vits-mms-tgl', ceb: 'vits-mms-ceb' };

for (const [languageCode, folder] of Object.entries(voices)) {
  const outputDirectory = join(modelsDirectory, folder);
  await mkdir(outputDirectory, { recursive: true });

  for (const fileName of ['model.onnx', 'tokens.txt']) {
    const target = join(outputDirectory, fileName);
    const existing = await stat(target).catch(() => null);
    if (existing && existing.size > 0) {
      console.log(`${folder}/${fileName}: already downloaded`);
      continue;
    }
    const response = await fetch(`${baseUrl}/${languageCode}/${fileName}`);
    if (!response.ok || !response.body) throw new Error(`${folder}/${fileName}: download failed (${response.status})`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
    console.log(`${folder}/${fileName}: downloaded`);
  }
}
console.log(`Saved to ${modelsDirectory}`);
