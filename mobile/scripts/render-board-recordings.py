# Renders the board recordings listed in a manifest with the bundled voices (the same files and
# settings the app uses, see voiceSettings in builtInVoice.android.ts), as small AAC (.m4a) files.
# Called by make-board-recordings.mjs.
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
# One English woman's voice (Piper "Cori") for every language; Filipino and Bisaya arrive respelled
# for her (respellForEnglishVoice, done by make-board-recordings.mjs). Same settings as the app.
folder_name = 'vits-piper-en-cori'
noise, noise_w, length = 0.4, 0.5, 1.05
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
os.makedirs(out_dir, exist_ok=True)

with open(manifest_path, encoding='utf-8') as manifest_file:
    entries = json.load(manifest_file)

engines = {}


def engine_for(voice):
    if 'voice' not in engines:
        folder = os.path.join(models_dir, folder_name)
        engines['voice'] = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(
            model=sherpa_onnx.OfflineTtsModelConfig(
                vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                    model=os.path.join(folder, 'model.onnx'),
                    tokens=os.path.join(folder, 'tokens.txt'),
                    data_dir=os.path.join(folder, 'espeak-ng-data'),
                    noise_scale=noise,
                    noise_scale_w=noise_w,
                    length_scale=length,
                ),
                num_threads=4,
            ),
        ))
    return engines['voice']


def longest_seconds(text):
    # Same as longestSeconds in builtInVoice.android.ts: longer means extra sounds that are not words.
    return 0.5 + 0.12 * len(re.sub(r'[^\w]|[\d_]', '', text))


def trim_to_words(samples, rate):
    # Keeps only the words (same as trimToWords in builtInVoice.android.ts): the quiet murmur or breath
    # before the first word and after the last one is cut, keeping 40 ms of the fade-out, with a short
    # fade so the cut makes no click.
    window = max(1, round(rate * 0.02))
    windows = len(samples) // window
    if windows == 0:
        return samples
    energy = np.sqrt((samples[:windows * window].reshape(windows, window) ** 2).mean(axis=1))
    loud = np.where(energy >= energy.max() * 0.03)[0]
    start = max(0, loud[0] * window - round(rate * 0.01))
    end = min(len(samples), (loud[-1] + 1) * window + round(rate * 0.04))
    kept = samples[start:end].copy()
    fade = min(round(rate * 0.015), len(kept) // 2)
    ramp = np.arange(fade, dtype=np.float32) / max(1, fade)
    kept[:fade] *= ramp
    kept[len(kept) - fade:] *= ramp[::-1]
    return kept


made = 0
for entry in entries:
    target = os.path.join(out_dir, entry['file'])
    if os.path.exists(target):
        continue
    spoken = entry['prepared'].lower().strip()
    # Made up to 6 times if it runs on with extra sounds; the shortest is kept (recordings are made
    # once, so more tries than the app).
    samples = None
    for attempt in range(6):
        audio = engine_for(entry['voice']).generate(spoken, sid=0, speed=1.0)
        words = trim_to_words(np.asarray(audio.samples, dtype=np.float32), audio.sample_rate)
        if samples is None or len(words) < len(samples):
            samples = words
        if len(samples) / audio.sample_rate <= longest_seconds(spoken):
            break
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
        subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-i', wav_path, '-c:a', 'aac', '-b:a', '40k', '-ac', '1', '-ar', '22050', target], check=True)
    made += 1

print(f'{made} new recordings, {len(entries)} in total')
