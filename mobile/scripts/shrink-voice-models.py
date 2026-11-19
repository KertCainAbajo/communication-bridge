"""Shrinks the bundled voice models (about 114 MB -> 38 MB each) so the APK stays small.

Converts each native-assets/models/*/model.onnx to 8-bit weights, keeping the metadata
sherpa-onnx needs (sample rate, language, ...). Run after scripts/download-voice-model.mjs:

    python -m pip install onnx onnxruntime
    python scripts/shrink-voice-models.py
"""
import glob
import os
import shutil
import tempfile

import onnx
from onnxruntime.quantization import QuantType, quantize_dynamic

models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'native-assets', 'models')

for model_path in sorted(glob.glob(os.path.join(models_dir, '*', 'model.onnx'))):
    original = onnx.load(model_path, load_external_data=False)
    if any(prop.key == 'shrunk' for prop in original.metadata_props):
        print(f'{model_path}: already small')
        continue

    with tempfile.TemporaryDirectory() as work_dir:
        small_path = os.path.join(work_dir, 'model.onnx')
        quantize_dynamic(model_path, small_path, weight_type=QuantType.QUInt8)
        small = onnx.load(small_path)
        del small.metadata_props[:]
        small.metadata_props.extend(original.metadata_props)
        small.metadata_props.add(key='shrunk', value='uint8')
        onnx.save(small, small_path)
        shutil.copyfile(small_path, model_path)

    print(f'{model_path}: {os.path.getsize(model_path) / 1e6:.0f} MB')
