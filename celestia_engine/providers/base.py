"""Shared provider plumbing: errors and an async HTTP client with retries."""

from __future__ import annotations

import asyncio

import httpx


class ProviderError(RuntimeError):
    """The provider is configured but the call failed."""


class ProviderNotConfigured(ProviderError):
    """The provider is missing credentials/config and was skipped."""


USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 celest.ia/1.0"
)


async def _request_json(
    method: str,
    url: str,
    *,
    params: dict | None = None,
    json_body: dict | None = None,
    headers: dict | None = None,
    timeout_s: float = 20.0,
    retries: int = 3,
) -> dict:
    """HTTP request returning JSON, with exponential-backoff retries."""
    last_error: Exception | None = None
    merged_headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if headers:
        merged_headers.update(headers)
    for attempt in range(retries):
        try:
            async with httpx.AsyncClient(timeout=timeout_s) as client:
                response = await client.request(
                    method, url, params=params, json=json_body, headers=merged_headers
                )
                if response.status_code == 429 and attempt < retries - 1:
                    await asyncio.sleep(2**attempt)
                    continue
                response.raise_for_status()
                return response.json()
        except (httpx.HTTPError, ValueError) as error:
            last_error = error
            if attempt < retries - 1:
                await asyncio.sleep(2**attempt)
    raise ProviderError(
        f"{method} {_redact(url)} failed after {retries} attempts: "
        f"{_redact(str(last_error))}"
    )


def _redact(text: str) -> str:
    """Strip query strings from URLs in error text — keys never reach logs."""
    import re

    return re.sub(r"(https?://[^\s'\"?]+)\?[^\s'\"]*", r"\1?<params ocultos>", text)


async def get_json(
    url: str,
    *,
    params: dict | None = None,
    headers: dict | None = None,
    timeout_s: float = 20.0,
    retries: int = 3,
) -> dict:
    return await _request_json(
        "GET", url, params=params, headers=headers, timeout_s=timeout_s, retries=retries
    )


async def post_json(
    url: str,
    *,
    json_body: dict,
    headers: dict | None = None,
    timeout_s: float = 20.0,
    retries: int = 3,
) -> dict:
    return await _request_json(
        "POST", url, json_body=json_body, headers=headers, timeout_s=timeout_s, retries=retries
    )
