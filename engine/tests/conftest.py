"""Fixtures do motor: testes 100% offline e dados em diretório temporário."""

from __future__ import annotations

import ipaddress
import socket

import pytest

from celestia_engine.config import Settings

_REAL_CONNECT = socket.socket.connect
_REAL_CONNECT_EX = socket.socket.connect_ex
_REAL_GETADDRINFO = socket.getaddrinfo
_INET = (socket.AF_INET, socket.AF_INET6)


def _is_local_host(host) -> bool:
    if host is None:
        return True
    if isinstance(host, bytes):
        host = host.decode("ascii", "replace")
    host = str(host).strip().rstrip(".").lower()
    if host in ("", "localhost") or host.endswith(".localhost"):
        return True
    try:
        return ipaddress.ip_address(host.split("%", 1)[0]).is_loopback
    except ValueError:
        return False


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    """Qualquer connect TCP/UDP real e qualquer DNS de host não-local falham.

    Cada tentativa é REGISTRADA e o teste falha no teardown se houver alguma —
    mesmo que o código sob teste engula o RuntimeError (ex.: ``except
    Exception`` num provider). Unix sockets e DNS de localhost seguem ok.
    Um teste que tenta de propósito pede esta fixture e limpa a lista.
    """
    attempts: list[tuple[str, object]] = []

    def blocked(kind, target):
        attempts.append((kind, target))
        raise RuntimeError(f"rede bloqueada nos testes do motor: {kind} {target!r}")

    def connect(self, address):
        if self.family in _INET:
            blocked("connect", address)
        return _REAL_CONNECT(self, address)

    def connect_ex(self, address):
        if self.family in _INET:
            blocked("connect_ex", address)
        return _REAL_CONNECT_EX(self, address)

    def getaddrinfo(host, *args, **kwargs):
        if not _is_local_host(host):
            blocked("getaddrinfo", host)
        return _REAL_GETADDRINFO(host, *args, **kwargs)

    monkeypatch.setattr(socket.socket, "connect", connect)
    monkeypatch.setattr(socket.socket, "connect_ex", connect_ex)
    monkeypatch.setattr(socket, "getaddrinfo", getaddrinfo)
    yield attempts
    if attempts:
        pytest.fail(f"teste tentou acessar a rede: {attempts!r}", pytrace=False)


@pytest.fixture
def settings(tmp_path) -> Settings:
    """Settings sem chaves e com todo CSV dentro de tmp_path."""
    data = tmp_path / "data"
    return Settings(
        history_enabled=False,
        history_dir=str(data),
        mesh_csv=str(data / "routes_live.csv"),
        strategy_csv=str(data / "strategy_performance.csv"),
    )
