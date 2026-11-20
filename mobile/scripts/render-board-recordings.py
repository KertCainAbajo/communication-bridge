# Renders the board recordings listed in a manifest with the bundled MMS voices (the same files the
# app uses), as small AAC (.m4a) files. Called by make-board-recordings.mjs.
# Needs: pip install sherpa-onnx==1.12.40 numpy imageio-ffmpeg
# Usage: python render-board-recordings.py <manifest.json> <output dir> <voice models dir>
import json
import os
import re
import subprocess
import sys
import tempfile
import wave

import imageio_ffmpeg
import numpy as np
import sherpa_onnx

manifest_path, out_dir, models_dir = sys.argv[1:4]
folders = {'fil': 'vits-mms-tgl', 'ceb': 'vits-mms-ceb', 'en': 'vits-mms-eng'}
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
os.makedirs(out_dir, exist_ok=True)

with open(manifest_path, encoding='utf-8') as manifest_file:
    entries = json.load(manifest_file)

engines = {}


def engine_for(voice):
    if voice not in engines:
        folder = os.path.join(models_dir, folders[voice])
        engines[voice] = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(
            model=sherpa_onnx.OfflineTtsModelConfig(
                vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                    model=os.path.join(folder, 'model.onnx'),
                    tokens=os.path.join(folder, 'tokens.txt'),
                    # Same settings as the app (builtInVoice.android.ts).
                    noise_scale=0.35,
                    noise_scale_w=0.5,
                    length_scale=1.1,
                ),
                num_threads=4,
            ),
        ))
    return engines[voice]


made = 0
for entry in entries:
    target = os.path.join(out_dir, entry['file'])
    if os.path.exists(target):
        continue
    # A trailing ' - -' (pause) stops an extra sound after the last word (see textForVoice in the app).
    spoken = re.sub(r'[.,!?;:]+$', '', entry['prepared'].lower().strip()) + ' - -'
    audio = engine_for(entry['voice']).generate(spoken, sid=0, speed=1.0)
    samples = np.asarray(audio.samples, dtype=np.float32)
    if samples.size == 0:
        raise SystemExit(f'No speech for {entry["key"]!r}')
    samples = samples / (np.max(np.abs(samples)) or 1.0) * 0.9
    rate = audio.sample_rate
    # A little silence first (some phones cut the very start of a sound) and after.
    samples = np.concatenate([np.zeros(int(rate * 0.05), np.float32), samples, np.zeros(int(rate * 0.2), np.float32)])
    with tempfile.TemporaryDirectory() as temporary:
        wav_path = os.path.join(temporary, 'speech.wav')
        with wave.open(wav_path, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(rate)
            wav_file.writeframes((samples * 32767).astype(np.int16).tobytes())
        subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-i', wav_path, '-c:a', 'aac', '-b:a', '40k', '-ac', '1', target], check=True)
    made += 1

print(f'{made} new recordings, {len(entries)} in total')
