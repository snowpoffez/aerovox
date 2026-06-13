"""AeroVox ElevenLabs bridge.

This is the Python side that can listen for trigger words, call ElevenLabs,
and forward commands to Arduino over serial.
"""

from __future__ import annotations

import json
from pathlib import Path

TRIGGER_WORDS_PATH = Path(__file__).resolve().parents[2] / "public" / "data" / "trigger-words.json"


def load_trigger_words() -> dict:
    with TRIGGER_WORDS_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def main() -> None:
    trigger_words = load_trigger_words()
    print("AeroVox ElevenLabs bridge ready")
    print(f"Loaded categories: {', '.join(trigger_words.get('categories', {}).keys())}")
    print("Add ElevenLabs and serial code here.")


if __name__ == "__main__":
    main()
