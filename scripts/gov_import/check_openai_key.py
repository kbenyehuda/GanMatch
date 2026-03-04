#!/usr/bin/env python3
"""
Quick OpenAI key sanity-check utility for this repo.

Loads repo-root `.env.local`, then performs a minimal API call to confirm:
- key is present and formatted
- openai python package is installed
- the key is valid (401 vs 429 quota vs network)

Usage (PowerShell):
  python scripts/gov_import/check_openai_key.py --trace
  python scripts/gov_import/check_openai_key.py --model gpt-4o-mini --prompt "say ok" --trace
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from typing import Any

from dotenv import dotenv_values, load_dotenv

try:
    from openai import OpenAI
except Exception:
    OpenAI = None  # type: ignore


_HEBREW_RE = re.compile(r"[\u0590-\u05FF]")


def reverse_for_ltr_console(s: str) -> str:
    # Only for display; never mutate data used for the API call.
    if not s:
        return s
    if not _HEBREW_RE.search(s):
        return s
    return s[::-1]


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_env() -> None:
    load_dotenv(repo_root() / ".env.local")


def _get_openai_key() -> str:
    return (os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_KEY") or "").strip()


def _dotenv_has_key(path: Path) -> bool:
    try:
        vals = dotenv_values(path)
        v = vals.get("OPENAI_API_KEY") or vals.get("OPENAI_KEY")
        return bool((v or "").strip())
    except Exception:
        return False


def _redact_key(key: str) -> str:
    if not key:
        return "<missing>"
    k = key.strip()
    if len(k) <= 10:
        return "<present:very_short>"
    # ASCII-only redaction (avoids Windows console encoding issues).
    return f"{k[:7]}...{k[-4:]}"


def _classify_openai_exception(e: Exception) -> str:
    # Works across multiple openai package versions by inspecting shape/message.
    msg = str(e)
    name = type(e).__name__
    lower = msg.lower()

    if "insufficient_quota" in lower or "exceeded your current quota" in lower:
        return "quota"
    if "invalid_api_key" in lower or "incorrect api key" in lower:
        return "invalid_key"
    if "authentication" in lower and "401" in lower:
        return "invalid_key"
    if "rate limit" in lower or "429" in lower:
        return "rate_limit"
    if "timed out" in lower or "timeout" in lower:
        return "timeout"
    if "name or service not known" in lower or "getaddrinfo" in lower or "dns" in lower:
        return "network_dns"
    if "connection" in lower or "ssl" in lower:
        return "network"
    if name in ("PermissionDeniedError",):
        return "permission"

    return "unknown"


def print_diag(*, label: str, value: str, trace: bool) -> None:
    print(f"{label}: {value}")
    if trace:
        vrtl = reverse_for_ltr_console(value)
        if vrtl != value:
            print(f"{label}_rtl: {vrtl}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Check OpenAI API key + make a tiny request")
    ap.add_argument("--model", default=(os.getenv("OPENAI_MODEL") or "gpt-4o-mini").strip() or "gpt-4o-mini")
    ap.add_argument("--prompt", default="Reply with exactly: OK", help="Prompt to send")
    ap.add_argument("--max-tokens", type=int, default=16)
    ap.add_argument("--trace", action="store_true", help="Print extra debug info (no secrets)")
    ap.add_argument("--no-dotenv", action="store_true", help="Do not load repo-root .env.local")
    args = ap.parse_args()

    env_path = repo_root() / ".env.local"
    if not args.no_dotenv:
        load_dotenv(env_path)  # does NOT override process env vars by default

    key = _get_openai_key()
    print("=== OpenAI key check ===")
    print_diag(label="repo_root", value=str(repo_root()), trace=args.trace)
    print_diag(label="dotenv_loaded", value=str(not args.no_dotenv), trace=args.trace)
    if not args.no_dotenv:
        print_diag(label="dotenv_path", value=str(env_path), trace=args.trace)
        print_diag(label="dotenv_has_openai_key", value=str(_dotenv_has_key(env_path)), trace=args.trace)
    print_diag(label="openai_package_installed", value=str(bool(OpenAI)), trace=args.trace)
    print_diag(label="OPENAI_API_KEY_present", value=str(bool(key)), trace=args.trace)
    print_diag(label="OPENAI_API_KEY_redacted", value=_redact_key(key), trace=args.trace)
    print_diag(label="model", value=str(args.model), trace=args.trace)
    print_diag(label="prompt", value=str(args.prompt), trace=args.trace)
    print()

    if not OpenAI:
        print("ERROR: python package `openai` is not installed in this environment.")
        print("Fix: `pip install openai` (ideally inside your venv).")
        return 2

    if not key:
        print("ERROR: Missing OPENAI_API_KEY (or OPENAI_KEY).")
        print("Fix: add it to repo-root `.env.local` as OPENAI_API_KEY=...")
        return 2

    try:
        client = OpenAI(api_key=key)
        resp = client.chat.completions.create(
            model=args.model,
            messages=[
                {"role": "system", "content": "Return a short plain-text response."},
                {"role": "user", "content": args.prompt},
            ],
            temperature=0,
            max_tokens=max(1, int(args.max_tokens)),
        )
        text = (resp.choices[0].message.content or "").strip()
        print("=== Success ===")
        print_diag(label="response", value=text, trace=args.trace)
        return 0
    except Exception as e:
        kind = _classify_openai_exception(e)
        print("=== Failure ===")
        print(f"error_type: {type(e).__name__}")
        print(f"error_kind: {kind}")
        print(f"error: {e}")
        print()
        if kind == "quota":
            print("This looks like a billing/quota issue (429 insufficient_quota).")
            print("Fix: check your OpenAI project billing, or confirm the key belongs to the project with quota.")
        elif kind == "invalid_key":
            print("This looks like an invalid key (401).")
            print("Fix: re-copy the key; ensure there are no extra quotes/spaces; ensure it is the correct project key.")
        elif kind in ("rate_limit",):
            print("This looks like a transient rate-limit (429).")
            print("Fix: wait and retry; reduce parallel requests.")
        elif kind in ("network", "network_dns", "timeout"):
            print("This looks like a network/connectivity issue.")
            print("Fix: check VPN/proxy/firewall; retry from a different network.")
        elif kind == "permission":
            print("This looks like a permission issue.")
            print("Fix: verify the key has access to the requested model in your project.")
        else:
            print("Unclassified error. Run again with --trace and share the output if needed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

