#!/bin/sh
# Makes native-assets/models/vits-piper-en-cori: the English woman's voice (Piper "Cori", CC BY 4.0,
# Hi-Fi TTS dataset by NVIDIA), with its weights stored as int8 (about 4x smaller, see
# mms-shrink-weights.py) and only the English pronunciation files of espeak-ng-data.
# Usage: sh scripts/prepare-cori-voice.sh <python with onnx installed>
set -e
python="$1"
work="$(mktemp -d)"
curl -sSLf -o "$work/cori.tar.bz2" https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_GB-cori-medium.tar.bz2
tar xjf "$work/cori.tar.bz2" -C "$work"
src="$work/vits-piper-en_GB-cori-medium"
out="$(dirname "$0")/../native-assets/models/vits-piper-en-cori"
rm -rf "$out"
mkdir -p "$out/espeak-ng-data/lang/gmw"
cp "$src/tokens.txt" "$src/MODEL_CARD" "$out/"
(cd "$src/espeak-ng-data" && cp phontab phonindex phondata phondata-manifest intonations en_dict "$out/espeak-ng-data/" && cp -r voices "$out/espeak-ng-data/" && cp lang/gmw/en "$out/espeak-ng-data/lang/gmw/")
"$python" "$(dirname "$0")/mms-shrink-weights.py" "$src/en_GB-cori-medium.onnx" "$out/model.onnx"
rm -rf "$work"
