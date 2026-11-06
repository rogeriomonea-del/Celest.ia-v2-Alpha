"""Fixtures do motor: testes 100% offline e dados em diretório temporário."""

from __future__ import annotations

import socket

import pytest

from celestia_engine.config import Settings

_REAL_CONNECT = socket.socket.connect
_REAL_CONNECT_EX = socket.socket.connect_ex
_INET = (socket.AF_INET, socket.AF_INET6)


def _blocked(address):
    raise RuntimeError(f"rede bloqueada nos testes do motor: {address!r}")


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    """Qualquer connect TCP/UDP real falha o teste (unix sockets seguem ok)."""

    def connect(self, address):
        if self.family in _INET:
            _blocked(address)
        return _REAL_CONNECT(self, address)

    def connect_ex(self, address):
        if self.family in _INET:
            _blocked(address)
        return _REAL_CONNECT_EX(self, address)

    monkeypatch.setattr(socket.socket, "connect", connect)
    monkeypatch.setattr(socket.socket, "connect_ex", connect_ex)


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
