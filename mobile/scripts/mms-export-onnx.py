# Converts a Meta MMS voice (Hugging Face transformers format) into the sherpa-onnx VITS/MMS layout:
# model.onnx (inputs x, x_length, noise_scale, length_scale, noise_scale_w; output y) + tokens.txt,
# with the same metadata as sherpa-onnx's own MMS export. Then makes an int8 copy (model.int8.onnx).
# Usage: python export_mms.py <hf model id> <language name> <output dir> <hf cache dir>
import os
import sys
from collections import Counter

import onnx
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from transformers import AutoTokenizer, VitsModel

model_id, language, out_dir, cache_dir = sys.argv[1:5]
os.makedirs(out_dir, exist_ok=True)

tokenizer = AutoTokenizer.from_pretrained(model_id, cache_dir=cache_dir)
model = VitsModel.from_pretrained(model_id, cache_dir=cache_dir)
model.eval()


class OnnxModel(torch.nn.Module):
    def __init__(self, vits):
        super().__init__()
        self.vits = vits

    def forward(self, x, x_length, noise_scale, length_scale, noise_scale_w):
        # The model reads these scales from attributes; tensors here become graph inputs.
        self.vits.noise_scale = noise_scale
        self.vits.noise_scale_duration = noise_scale_w
        mask = (torch.arange(x.shape[1]).unsqueeze(0) < x_length.unsqueeze(1)).to(torch.int64)
        output = self.vits(input_ids=x, attention_mask=mask, speaking_rate=1.0 / length_scale)
        return output.waveform.unsqueeze(1)  # [N, 1, L]


wrapper = OnnxModel(model)
x = torch.randint(1, 10, (50,), dtype=torch.int64).unsqueeze(0)
x_length = torch.tensor([x.shape[1]], dtype=torch.int64)
scale = torch.tensor([1.0], dtype=torch.float32)
model_path = os.path.join(out_dir, 'model.onnx')
torch.onnx.export(
    wrapper,
    (x, x_length, scale, scale, scale),
    model_path,
    input_names=['x', 'x_length', 'noise_scale', 'length_scale', 'noise_scale_w'],
    output_names=['y'],
    dynamic_axes={'x': {0: 'N', 1: 'L'}, 'x_length': {0: 'N'}, 'y': {0: 'N', 2: 'L'}},
    opset_version=13,
    dynamo=False,
)

meta = {
    'model_type': 'vits',
    'comment': 'mms',
    'url': f'https://huggingface.co/{model_id}',
    'add_blank': int(bool(tokenizer.add_blank)),
    'language': language,
    'frontend': 'characters',
    'n_speakers': 0,
    'sample_rate': int(model.config.sampling_rate),
}


def add_meta(path):
    onnx_model = onnx.load(path)
    while len(onnx_model.metadata_props):
        onnx_model.metadata_props.pop()
    for key, value in meta.items():
        entry = onnx_model.metadata_props.add()
        entry.key = key
        entry.value = str(value)
    onnx.save(onnx_model, path)


add_meta(model_path)

# tokens.txt: "<token> <id>", plus an upper-case line for each single cased letter (same id).
vocab = sorted(tokenizer.get_vocab().items(), key=lambda item: item[1])
uppers = Counter(token.upper() for token, _ in vocab)
with open(os.path.join(out_dir, 'tokens.txt'), 'w', encoding='utf-8', newline='\n') as tokens_file:
    for token, index in vocab:
        if token.startswith('<'):
            continue
        tokens_file.write(f'{token} {index}\n')
        upper = token.upper()
        if token.lower() != upper and len(upper) == 1 and upper != token and uppers[upper] == 1:
            tokens_file.write(f'{upper} {index}\n')

int8_path = os.path.join(out_dir, 'model.int8.onnx')
quantize_dynamic(model_path, int8_path, weight_type=QuantType.QUInt8)
add_meta(int8_path)

for name in ['model.onnx', 'model.int8.onnx', 'tokens.txt']:
    print(name, os.path.getsize(os.path.join(out_dir, name)) // 1024, 'KB')
