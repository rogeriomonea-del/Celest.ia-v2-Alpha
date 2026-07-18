import sys
from pathlib import Path

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from celestia_travel.miles.connectmiles import ConnectMilesClient, MilesError


def _fake_transport(pages):
    """Constrói um transporte que devolve HTML por URL e registra os POSTs."""
    posted = {}

    def transport(url, data):
        if data is not None:
            posted.update(data)
            return pages.get("login_post", "")
        if "login" in url:
            return pages["login_get"]
        return pages["account"]

    return transport, posted


def test_fetch_balance_uses_csrf_and_session():
    pages = {
        "login_get": '<input name="csrf_token" value="tok-123">',
        "login_post": "",
        "account": '<div id="available-miles">87.450</div>',
    }
    transport, posted = _fake_transport(pages)
    client = ConnectMilesClient("user", "secret", transport=transport)

    balance = client.fetch_balance()

    assert balance.miles == 87450
    assert balance.program == "ConnectMiles"
    # O token CSRF extraído do formulário foi reenviado no POST de login.
    assert posted["csrf_token"] == "tok-123"
    assert posted["username"] == "user"
    assert posted["password"] == "secret"


def test_fetch_balance_raises_without_csrf():
    pages = {"login_get": "<form></form>", "login_post": "", "account": ""}
    transport, _ = _fake_transport(pages)
    client = ConnectMilesClient("user", "secret", transport=transport)
    with pytest.raises(MilesError):
        client.fetch_balance()


def test_fetch_balance_raises_when_balance_missing():
    pages = {
        "login_get": '<input name="csrf_token" value="tok">',
        "login_post": "",
        "account": "<div>login recusado</div>",
    }
    transport, _ = _fake_transport(pages)
    client = ConnectMilesClient("user", "secret", transport=transport)
    with pytest.raises(MilesError):
        client.fetch_balance()


def test_mock_balance():
    balance = ConnectMilesClient.mock(50_000)
    assert balance.miles == 50_000
    assert "demo" in balance.program
