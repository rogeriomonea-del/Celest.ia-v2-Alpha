import asyncio

import httpx
import pytest

from celestia_engine.providers.base import ProviderError, get_json


def _patched_client(monkeypatch, handler):
    real_client = httpx.AsyncClient
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw)
    )


def test_4xx_is_permanent_no_retry_and_surfaces_body(monkeypatch):
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(
            403, json={"message": "You are not subscribed to this API."}
        )

    _patched_client(monkeypatch, handler)
    with pytest.raises(ProviderError) as exc:
        asyncio.run(get_json("https://api.example.com/x?api_key=SECRET", retries=3))

    assert calls["n"] == 1, "4xx must not be retried"
    message = str(exc.value)
    assert "HTTP 403" in message
    assert "not subscribed" in message  # o diagnóstico do servidor chega ao log
    assert "SECRET" not in message      # e a chave não


def test_5xx_still_retries(monkeypatch):
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(500, text="boom")

    _patched_client(monkeypatch, handler)
    with pytest.raises(ProviderError):
        asyncio.run(get_json("https://api.example.com/x", retries=2))
    assert calls["n"] == 2
