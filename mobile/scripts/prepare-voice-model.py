"""Downloads and prepares the offline voice bundled in the Android app (used for Filipino and Bisaya).

Voice: Piper Filipino (tl_PH, medium) by IhorShevchuk, CC BY-NC-SA 4.0 (non-commercial use only).
https://huggingface.co/IhorShevchuk/piper-voice-tl-filipino

Converts it for sherpa-onnx (token list + model metadata) and adds only the Indonesian part of the
espeak-ng pronunciation data, which this voice uses. Output: native-assets/models/vits-piper-fil-v2/
(the folder is renamed whenever these files change, so phones copy the new files).

    python -m pip install onnx
    python scripts/prepare-voice-model.py
"""
import io
import json
import os
import shutil
import tarfile
import urllib.request

import onnx

VOICE_URL = 'https://huggingface.co/IhorShevchuk/piper-voice-tl-filipino/resolve/main/tl_PH-filipino-medium-model.onnx'
ESPEAK_URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/espeak-ng-data.tar.bz2'
ESPEAK_FILES = ['phondata', 'phondata-manifest', 'phonindex', 'phontab', 'intonations', 'id_dict', 'lang/poz/id']

output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'native-assets', 'models', 'vits-piper-fil-v2')
os.makedirs(output_dir, exist_ok=True)


def download(url: str) -> bytes:
    with urllib.request.urlopen(url) as response:
        return response.read()


config = json.loads(download(VOICE_URL + '.json'))

# sherpa-onnx tokens: one symbol per line. Multi-letter symbols are not supported and unused by this voice.
# Unix line endings are required: on Android a Windows carriage return breaks the list and the engine
# closes the app ("Duplicated token").
with open(os.path.join(output_dir, 'tokens.txt'), 'w', encoding='utf-8', newline=chr(10)) as file:
    for symbol, ids in config['phoneme_id_map'].items():
        if len(symbol) == 1:
            file.write(f'{symbol} {ids[0]}\n')

model = onnx.load_from_string(download(VOICE_URL))
metadata = {
    'model_type': 'vits',
    'comment': 'piper',
    'language': 'Filipino',
    'voice': config['espeak']['voice'],
    'has_espeak': '1',
    'n_speakers': str(config.get('num_speakers', 1)),
    'sample_rate': str(config['audio']['sample_rate']),
}
del model.metadata_props[:]
for key, value in metadata.items():
    model.metadata_props.add(key=key, value=value)
onnx.save(model, os.path.join(output_dir, 'model.onnx'))

espeak_dir = os.path.join(output_dir, 'espeak-ng-data')
shutil.rmtree(espeak_dir, ignore_errors=True)
with tarfile.open(fileobj=io.BytesIO(download(ESPEAK_URL)), mode='r:bz2') as archive:
    for name in ESPEAK_FILES:
        member = archive.getmember(f'espeak-ng-data/{name}')
        target = os.path.join(espeak_dir, *name.split('/'))
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, 'wb') as file:
            file.write(archive.extractfile(member).read())

print(f'Voice ready in {os.path.normpath(output_dir)}')
