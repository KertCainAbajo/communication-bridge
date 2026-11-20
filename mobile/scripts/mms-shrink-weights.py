# Stores a model's large weights as int8 (per output channel) with a DequantizeLinear node in front,
# so the file is ~4x smaller but the maths stays float: onnxruntime folds the dequantize at load time.
# Usage: python weight_only_int8.py <in.onnx> <out.onnx>
import sys

import numpy as np
import onnx
from onnx import helper, numpy_helper

source, target = sys.argv[1:3]
model = onnx.load(source)
graph = model.graph

weight_inputs = set()
for node in graph.node:
    if node.op_type in ('Conv', 'ConvTranspose', 'MatMul', 'Gemm') and len(node.input) > 1:
        weight_inputs.add(node.input[1])

new_initializers = []
new_nodes = []
kept = []
converted = 0
for init in graph.initializer:
    array = numpy_helper.to_array(init)
    if init.name not in weight_inputs or array.dtype != np.float32 or array.size < 4096 or array.ndim < 2:
        kept.append(init)
        continue
    axis = 0
    moved = np.moveaxis(array, axis, 0).reshape(array.shape[axis], -1)
    scale = np.abs(moved).max(axis=1) / 127.0
    scale[scale == 0] = 1.0
    shape = [1] * array.ndim
    shape[axis] = array.shape[axis]
    quantized = np.clip(np.round(array / scale.reshape(shape)), -127, 127).astype(np.int8)
    q_name, s_name, z_name = f'{init.name}_q', f'{init.name}_scale', f'{init.name}_zero'
    new_initializers += [
        numpy_helper.from_array(quantized, q_name),
        numpy_helper.from_array(scale.astype(np.float32), s_name),
        numpy_helper.from_array(np.zeros(array.shape[axis], dtype=np.int8), z_name),
    ]
    new_nodes.append(helper.make_node('DequantizeLinear', [q_name, s_name, z_name], [init.name], axis=axis, name=f'{init.name}_dequant'))
    converted += 1

del graph.initializer[:]
graph.initializer.extend(kept + new_initializers)
nodes = list(graph.node)
del graph.node[:]
graph.node.extend(new_nodes + nodes)
onnx.save(model, target)
print(f'converted {converted} weights')
