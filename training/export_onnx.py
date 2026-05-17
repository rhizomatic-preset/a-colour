#!/usr/bin/env python3
"""Export the fine-tuned encoder to int8-quantised ONNX for the in-browser runtime.

Writes to ../src/generated/word-encoder/ with the layout transformers.js (v3+)
expects:
  model.onnx              — full-precision ONNX (kept for sanity-checking)
  model_quantized.onnx    — int8 dynamic quantisation (what the PWA ships)
  config.json
  tokenizer.json
  tokenizer_config.json
  special_tokens_map.json
  vocab.txt

The browser-side mean-pool + L2-normalise pipeline is handled by transformers.js's
`pipeline('feature-extraction', ..., { pooling: 'mean', normalize: true })`; we
export only the underlying transformer.
"""
from __future__ import annotations

import argparse
import logging
import shutil
import sys
from pathlib import Path

from optimum.onnxruntime import ORTModelForFeatureExtraction, ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig
from transformers import AutoTokenizer


ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent
RUNS_DIR = ROOT / "runs"
# Lives under public/ (not src/generated/) because transformers.js fetches the
# model + tokenizer files at runtime from URLs. Vite serves public/ verbatim,
# files end up at /word-encoder/* in dist/.
OUTPUT_DIR = REPO_ROOT / "public" / "word-encoder"
# transformers.js expects ONNX files under an onnx/ subfolder; tokenizer +
# config sit at the model root.
ONNX_SUBDIR = OUTPUT_DIR / "onnx"


def resolve_run_dir(run: str | None) -> Path:
    if run:
        candidate = (RUNS_DIR / run) if not Path(run).is_absolute() else Path(run)
    else:
        latest_pointer = RUNS_DIR / "LATEST"
        if not latest_pointer.exists():
            raise SystemExit(
                f"No --run given and {latest_pointer} not found. Train a model first."
            )
        candidate = RUNS_DIR / latest_pointer.read_text().strip()
    if not (candidate / "model").exists():
        raise SystemExit(f"No model/ under {candidate}. Did training complete?")
    return candidate


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run", default=None, help="Run directory name. Defaults to runs/LATEST.")
    parser.add_argument(
        "--no-quantize",
        action="store_true",
        help="Skip int8 dynamic quantisation. Useful for sanity-comparing FP32 vs INT8.",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
    log = logging.getLogger("phase-b-export")

    run_dir = resolve_run_dir(args.run)
    model_dir = run_dir / "model"
    log.info("Run: %s", run_dir.name)
    log.info("Exporting from %s → %s", model_dir, OUTPUT_DIR)

    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ONNX_SUBDIR.mkdir(parents=True, exist_ok=True)

    # ORT export: round-trips the fine-tuned weights through ONNX.
    # We export into a temporary spot, then move .onnx files into onnx/.
    tmp_export = OUTPUT_DIR / "_export"
    ort_model = ORTModelForFeatureExtraction.from_pretrained(str(model_dir), export=True)
    ort_model.save_pretrained(str(tmp_export))
    log.info("Saved FP32 ONNX → %s/model.onnx", tmp_export)

    # Tokenizer needs to ship next to the model so the browser can encode queries.
    tokenizer = AutoTokenizer.from_pretrained(str(model_dir))
    tokenizer.save_pretrained(str(OUTPUT_DIR))
    log.info("Saved tokenizer → %s", OUTPUT_DIR)

    if not args.no_quantize:
        # Dynamic int8 quantisation: weights → int8, activations stay FP32.
        quantizer = ORTQuantizer.from_pretrained(str(tmp_export))
        qconfig = AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False)
        quantizer.quantize(save_dir=str(tmp_export), quantization_config=qconfig)
        log.info("Quantised → %s/model_quantized.onnx", tmp_export)

    # Move ONNX files into the onnx/ subfolder transformers.js expects, and
    # the config.json into the root next to the tokenizer.
    for onnx in tmp_export.glob("*.onnx"):
        shutil.move(str(onnx), str(ONNX_SUBDIR / onnx.name))
    for cfg in tmp_export.glob("*.json"):
        target = OUTPUT_DIR / cfg.name
        if not target.exists():
            shutil.move(str(cfg), str(target))
    shutil.rmtree(tmp_export, ignore_errors=True)

    # Print sizes so we know the bundle cost up front.
    for path in sorted(ONNX_SUBDIR.glob("*.onnx")):
        kb = path.stat().st_size / 1024
        log.info("  %s: %.1f KB", path.name, kb)

    log.info("Done. transformers.js will load from %s", OUTPUT_DIR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
