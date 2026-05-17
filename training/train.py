#!/usr/bin/env python3
"""Fine-tune a small sentence-transformer on the Colour Thesaurus distillation lookup.

Phase B kickoff plan:
  ~/rhizomatic-preset/guidance/projects/color-thesaurus/epics/01-word-mode/phase-b-fine-tune.md

Reads the 693-entry distillation JSON from ../src/generated/colour-distillation.json,
filters out confidence:low entries (which the runtime also ignores), builds two positive
prompt templates per remaining entry, and trains with MultipleNegativesRankingLoss using
in-batch negatives. Saves the fine-tuned model + a config.json under training/runs/<ts>/.

Typical invocation (via the colour-trickser justfile):
  just train                       # uses defaults
  just train --epochs=6            # tune hyperparams
"""
from __future__ import annotations

import argparse
import json
import logging
import random
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import torch
from datasets import Dataset
from sentence_transformers import (
    SentenceTransformer,
    SentenceTransformerTrainer,
    SentenceTransformerTrainingArguments,
    losses,
)
from sentence_transformers.training_args import BatchSamplers


ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent
TRAINING_PAIRS_PATH = ROOT / "data" / "training-pairs.json"
RUNS_DIR = ROOT / "runs"

# Family anchor template — encodes "{family} colour" as a positive for each
# noun. Reinforces the family-level signal alongside the specific library names.
FAMILY_TEMPLATE = "{family} colour"


def load_training_entries(path: Path) -> list[dict]:
    """Load the precomputed (noun, family, hex, libraryNames) pairs."""
    if not path.exists():
        raise SystemExit(
            f"{path} not found. Run `pnpm tsx scripts/dump-for-training.ts` first "
            "(or `just train-dump`)."
        )
    payload = json.loads(path.read_text())
    return payload["pairs"]


def build_pairs(
    entries: list[dict],
    positives_per_entry: int,
    include_family_anchor: bool,
) -> list[dict]:
    """Generate (anchor, positive) pairs from precomputed library-name targets.

    Each entry yields:
      - up to `positives_per_entry` pairs of (noun, libraryNames[i])
      - optionally one (noun, "{family} colour") pair
    Entries with empty libraryNames (confidence:low) are skipped — they're not
    used at runtime either.
    """
    pairs: list[dict] = []
    for entry in entries:
        names = entry.get("libraryNames") or []
        if not names:
            continue
        for name in names[:positives_per_entry]:
            pairs.append({"anchor": entry["noun"], "positive": name})
        if include_family_anchor:
            pairs.append({
                "anchor": entry["noun"],
                "positive": FAMILY_TEMPLATE.format(family=entry["family"]),
            })
    return pairs


def stratified_split(
    entries: list[dict],
    val_fraction: float,
    seed: int,
) -> tuple[list[dict], list[dict]]:
    """Family-stratified split so rare families aren't lost from train.

    Splits at the entry level (not the pair level) so both prompt templates of the
    same noun land on the same side. Families with fewer than 5 entries contribute
    nothing to val (too thin to spare).
    """
    rng = random.Random(seed)
    by_family: dict[str, list[dict]] = {}
    for entry in entries:
        by_family.setdefault(entry["family"], []).append(entry)
    train: list[dict] = []
    val: list[dict] = []
    for items in by_family.values():
        rng.shuffle(items)
        n_val = int(round(len(items) * val_fraction)) if len(items) >= 5 else 0
        val.extend(items[:n_val])
        train.extend(items[n_val:])
    rng.shuffle(train)
    rng.shuffle(val)
    return train, val


def pick_device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", default="sentence-transformers/all-MiniLM-L6-v2")
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--warmup-ratio", type=float, default=0.1)
    parser.add_argument("--val-fraction", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--positives-per-entry",
        type=int,
        default=1,
        help="How many library-name positives per noun (1-3). 1 = top-Oklab only.",
    )
    parser.add_argument(
        "--no-family-anchor",
        action="store_true",
        help="Omit the (noun, '{family} colour') anchor pair.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Override the runs/<timestamp>/ output directory. Used by CI / re-runs.",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
    log = logging.getLogger("phase-b-train")

    timestamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    output_dir = args.output_dir or (RUNS_DIR / timestamp)
    output_dir.mkdir(parents=True, exist_ok=True)

    all_entries = load_training_entries(TRAINING_PAIRS_PATH)
    # build_pairs handles the libraryNames==[] skip (confidence:low) implicitly,
    # but the split should also drop those entries so the val histogram is honest.
    kept = [e for e in all_entries if e.get("libraryNames")]
    family_hist = Counter(e["family"] for e in kept)
    log.info(
        "Loaded %d entries; kept %d with non-empty libraryNames (confidence != low).",
        len(all_entries),
        len(kept),
    )
    log.info("Family histogram: %s", dict(family_hist.most_common()))

    train_entries, val_entries = stratified_split(kept, args.val_fraction, args.seed)
    include_family_anchor = not args.no_family_anchor
    train_pairs = build_pairs(train_entries, args.positives_per_entry, include_family_anchor)
    val_pairs = build_pairs(val_entries, args.positives_per_entry, include_family_anchor)
    log.info("Train: %d entries → %d pairs.", len(train_entries), len(train_pairs))
    log.info("Val:   %d entries → %d pairs.", len(val_entries), len(val_pairs))

    train_dataset = Dataset.from_list(train_pairs)
    val_dataset = Dataset.from_list(val_pairs) if val_pairs else None

    device = pick_device()
    log.info("Device: %s", device)
    model = SentenceTransformer(args.model, device=device)
    loss = losses.MultipleNegativesRankingLoss(model)

    training_args = SentenceTransformerTrainingArguments(
        output_dir=str(output_dir / "checkpoints"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.lr,
        warmup_ratio=args.warmup_ratio,
        eval_strategy="epoch" if val_dataset is not None else "no",
        logging_strategy="epoch",
        save_strategy="no",
        # NO_DUPLICATES prevents the same anchor appearing twice in a batch — critical
        # because our two prompt templates per noun would otherwise become each other's
        # "negative" under in-batch sampling.
        batch_sampler=BatchSamplers.NO_DUPLICATES,
        seed=args.seed,
        report_to=[],
        bf16=False,
    )

    trainer = SentenceTransformerTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        loss=loss,
    )
    trainer.train()

    model_dir = output_dir / "model"
    model.save_pretrained(str(model_dir))
    log.info("Saved fine-tuned model to %s", model_dir)

    config = {
        "timestamp": timestamp,
        "base_model": args.model,
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "lr": args.lr,
        "warmup_ratio": args.warmup_ratio,
        "val_fraction": args.val_fraction,
        "seed": args.seed,
        "positives_per_entry": args.positives_per_entry,
        "include_family_anchor": include_family_anchor,
        "n_train_entries": len(train_entries),
        "n_val_entries": len(val_entries),
        "n_train_pairs": len(train_pairs),
        "n_val_pairs": len(val_pairs),
        "device": device,
        "family_anchor_template": FAMILY_TEMPLATE if include_family_anchor else None,
        "family_histogram": dict(family_hist),
    }
    (output_dir / "config.json").write_text(json.dumps(config, indent=2))

    # Maintain a runs/LATEST pointer so eval_model.py / export_onnx.py can find
    # the most recent training run without timestamp guessing.
    (RUNS_DIR / "LATEST").write_text(output_dir.name + "\n")
    log.info("runs/LATEST → %s", output_dir.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
