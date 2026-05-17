#!/usr/bin/env python3
"""Encode the colour library with the exported ONNX, save as a binary for the runtime.

Reads `training/data/colors-small.json` (entry order = library order in colors-small.csv),
runs each entry's name through the quantised ONNX encoder, mean-pools + L2-normalises,
writes a Float32 binary the TS runtime can mmap directly.

Outputs:
  src/generated/colour-embeddings.bin       — 980 × 384 × 4 bytes ≈ 1.5 MB
  src/generated/colour-embeddings.meta.json — { dim, count, library, modelDir }

The order of vectors in the .bin matches the index in colors-small.json so the
TS side can match by row, no name-keyed lookup needed.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer


ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent
# Both the model and the embeddings live under public/ so Vite serves them
# at /word-encoder/ and /colour-embeddings.bin at runtime.
ENCODER_DIR = REPO_ROOT / "public" / "word-encoder"
ONNX_SUBDIR = ENCODER_DIR / "onnx"
LIBRARY_PATH = ROOT / "data" / "colors-small.json"
EMBEDDINGS_PATH = REPO_ROOT / "public" / "colour-embeddings.bin"
META_PATH = REPO_ROOT / "public" / "colour-embeddings.meta.json"


def mean_pool(token_embeddings: np.ndarray, attention_mask: np.ndarray) -> np.ndarray:
    """Mean-pool over the sequence dimension, masked by attention.

    Mirrors the sentence-transformers pooling step that lives outside the ONNX
    graph (we exported only the transformer body). transformers.js does the
    same pooling at runtime via { pooling: 'mean' }.
    """
    mask = attention_mask[..., None].astype(np.float32)
    summed = (token_embeddings * mask).sum(axis=1)
    counts = mask.sum(axis=1).clip(min=1e-9)
    return summed / counts


def l2_normalize(x: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(x, axis=1, keepdims=True).clip(min=1e-9)
    return x / norms


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--model",
        default="model_quantized.onnx",
        help="ONNX filename under src/generated/word-encoder/. Use model.onnx for FP32 sanity-check.",
    )
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--max-length", type=int, default=64, help="Token truncation cap; colour names are short.")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
    log = logging.getLogger("phase-b-embed")

    model_path = ONNX_SUBDIR / args.model
    if not model_path.exists():
        raise SystemExit(f"{model_path} not found. Run `just train-export` first.")
    if not LIBRARY_PATH.exists():
        raise SystemExit(f"{LIBRARY_PATH} not found. Run `just train-dump` first.")

    library = json.loads(LIBRARY_PATH.read_text())
    names = [entry["name"] for entry in library]
    log.info("Loaded %d colour-library names.", len(names))

    log.info("Loading ONNX session: %s", model_path)
    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    tokenizer = AutoTokenizer.from_pretrained(str(ENCODER_DIR))

    all_vectors: list[np.ndarray] = []
    for start in range(0, len(names), args.batch_size):
        batch = names[start : start + args.batch_size]
        encoded = tokenizer(
            batch,
            padding=True,
            truncation=True,
            max_length=args.max_length,
            return_tensors="np",
        )
        outputs = session.run(
            None,
            {
                "input_ids": encoded["input_ids"].astype(np.int64),
                "attention_mask": encoded["attention_mask"].astype(np.int64),
                "token_type_ids": encoded.get("token_type_ids", np.zeros_like(encoded["input_ids"])).astype(np.int64),
            },
        )
        token_embeddings = outputs[0]  # (batch, seq, dim)
        pooled = mean_pool(token_embeddings, encoded["attention_mask"])
        normalized = l2_normalize(pooled)
        all_vectors.append(normalized.astype(np.float32))

    embeddings = np.concatenate(all_vectors, axis=0)
    assert embeddings.shape[0] == len(names), f"vector count {embeddings.shape[0]} != library size {len(names)}"
    log.info("Encoded library: shape=%s", embeddings.shape)

    embeddings.tofile(EMBEDDINGS_PATH)
    META_PATH.write_text(json.dumps({
        "dim": int(embeddings.shape[1]),
        "count": int(embeddings.shape[0]),
        "library": "small",
        "modelDir": "word-encoder",
        "modelFile": args.model,
        "pooling": "mean",
        "normalized": True,
    }, indent=2) + "\n")
    log.info("Wrote %s (%.1f KB) + %s", EMBEDDINGS_PATH.name, EMBEDDINGS_PATH.stat().st_size / 1024, META_PATH.name)

    # Quick sanity: cosine between "wood" query (a noun we trained on) and
    # library entries should put browns at the top.
    test_query = "wood"
    encoded = tokenizer([test_query], padding=True, truncation=True, return_tensors="np")
    outputs = session.run(
        None,
        {
            "input_ids": encoded["input_ids"].astype(np.int64),
            "attention_mask": encoded["attention_mask"].astype(np.int64),
            "token_type_ids": np.zeros_like(encoded["input_ids"]).astype(np.int64),
        },
    )
    q = l2_normalize(mean_pool(outputs[0], encoded["attention_mask"])).astype(np.float32)
    scores = (q @ embeddings.T).ravel()
    top3 = np.argsort(-scores)[:3]
    log.info("Sanity probe %r → %s", test_query, [(library[int(i)]["name"], library[int(i)]["family"]) for i in top3])

    return 0


if __name__ == "__main__":
    sys.exit(main())
