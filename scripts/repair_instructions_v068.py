#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Repair RELEASE-INSTRUCTIONS-v0.6.8.md: regenerate from template constant
with a correctly filtered expected-status block (placeholder-based, no regex)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from release_v068_all import INSTRUCTIONS_MD, expected_git_status_block, ROOT  # noqa: E402

F = ROOT / "docs" / "releases" / "RELEASE-INSTRUCTIONS-v0.6.8.md"
assert "<!--EXPECTED-GIT-STATUS-->" in INSTRUCTIONS_MD, "placeholder missing in template"
content = INSTRUCTIONS_MD.replace("<!--EXPECTED-GIT-STATUS-->", expected_git_status_block())
F.write_text(content, encoding="utf-8")

text = F.read_text(encoding="utf-8")
fences = text.count("```")
plain_open = text.count("\n```\n")
assert "<!--EXPECTED-GIT-STATUS-->" not in text, "placeholder not replaced"
print("fences:", fences, "| plain fence lines:", plain_open)
print("lines:", len(text.splitlines()))
import re
m = re.search(r"Ожидаемый состав[^\n]*\n\n```\n(M[^\n]*\n)", text)
print("block starts with:", m.group(1).strip() if m else "NOT FOUND")
