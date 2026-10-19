"""
Shared Anthropic API client for every agent that needs an LLM call
(triage, requirements extraction, pipeline intelligence, digest).
"""
import json
import os
import re
import threading
from typing import Optional

try:
    import anthropic
except ImportError:
    anthropic = None

CHEAP_MODEL = "claude-haiku-4-5-20251001"
STRONG_MODEL = "claude-sonnet-4-6"
WRITER_MODEL = "claude-opus-5-5"   # on-click writing where the reply is the product


def _get_client() -> "anthropic.Anthropic":
    if anthropic is None:
        raise ImportError(
            "The 'anthropic' package is not installed. Run: "
            "pip install anthropic --break-system-packages"
        )
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable is not set.")
    # This key is not scoped to a workspace, so every request names one.
    # ANTHROPIC_WORKSPACE_ID overrides the account default.
    workspace_id = os.environ.get("ANTHROPIC_WORKSPACE_ID") or "wrkspc_01GhKEdHEnDVCp3qUpqTrN8U"
    headers = {"anthropic-workspace-id": workspace_id}
    return anthropic.Anthropic(api_key=api_key, default_headers=headers)


def _extract_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        start = text.find("{")
        obj, _ = json.JSONDecoder().raw_decode(text[start if start >= 0 else 0:])
        return obj
    except json.JSONDecodeError as e:
        raise ValueError(
            f"LLM response was not valid JSON after cleanup: {e}\n"
            f"Raw response (first 500 chars): {text[:500]}"
        )


# Haiku 4.5 caches a prefix only at 4,096 tokens or more. A shorter prompt is
# billed as normal input and the API returns no error. Callers that repeat one
# system prompt (triage, one scope at a time) mark it anyway.
_cache_lock = threading.Lock()
_cache_usage = {"creation": 0, "read": 0}


def take_cache_usage() -> dict:
    """Tokens written to and read from the prompt cache since the last take."""
    with _cache_lock:
        snap = dict(_cache_usage)
        _cache_usage["creation"] = 0
        _cache_usage["read"] = 0
    return snap


def _note_cache(usage) -> None:
    if usage is None:
        return
    created = getattr(usage, "cache_creation_input_tokens", 0) or 0
    read = getattr(usage, "cache_read_input_tokens", 0) or 0
    with _cache_lock:
        _cache_usage["creation"] += created
        _cache_usage["read"] += read


def call_llm_json(system_prompt: str, user_content: str,
                   model: str = CHEAP_MODEL, max_tokens: int = 1024,
                   cache_system: bool = False) -> dict:
    client = _get_client()
    system = system_prompt
    if cache_system:
        system = [{
            "type": "text",
            "text": system_prompt,
            "cache_control": {"type": "ephemeral"},
        }]
    response = client.messages.create(
        model=model, max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    )
    if cache_system:
        _note_cache(getattr(response, "usage", None))
    text = "".join(block.text for block in response.content if block.type == "text")
    return _extract_json(text)


def call_llm_json_premium(system_prompt: str, user_content: str,
                          model: str = WRITER_MODEL, max_tokens: int = 4000,
                          effort: str = "low") -> dict:
    """For Claude Opus 5.5-class models: thinking is always on (effort is the
    only dial), and the server-side refusal fallback re-runs a declined
    request on a fallback model. Both are sent as raw body/header fields so
    this works on the 0.x SDK (local) and 1.x SDK (GitHub Actions) alike."""
    client = _get_client()
    response = client.messages.create(
        model=model, max_tokens=max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
        extra_headers={"anthropic-beta": "server-side-fallback-2026-07-01"},
        extra_body={"output_config": {"effort": effort}, "fallbacks": "default"},
    )
    if response.stop_reason == "refusal":
        raise ValueError(f"Model declined the request ({getattr(response, 'stop_details', None)})")
    text = "".join(block.text for block in response.content if block.type == "text")
    return _extract_json(text)


def call_llm_text(system_prompt: str, user_content: str,
                   model: str = STRONG_MODEL, max_tokens: int = 4096) -> str:
    client = _get_client()
    response = client.messages.create(
        model=model, max_tokens=max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    )
    return "".join(block.text for block in response.content if block.type == "text")


def load_prompt(prompt_filename: str) -> str:
    """The prompt file, or its fine-tuned version from the Settings page
    (services/agent_settings.py), with the search scope applied."""
    from services.agent_settings import prompt_for
    path = os.path.join(os.path.dirname(__file__), "..", "prompts", prompt_filename)
    with open(path) as f:
        return prompt_for(prompt_filename, f.read())
