"""Cliente de saldo ConnectMiles com sessão autenticada de verdade.

O protótipo antigo fazia login com ``urllib.request.urlopen`` sem cookie jar:
a sessão criada pelo POST de login era descartada e a página da conta era
requisitada anonimamente — o saldo nunca viria. Este cliente mantém uma
sessão real (``http.cookiejar``), extrai o token CSRF do formulário e só
então consulta a conta.

Aviso: automatizar login em área autenticada pode violar os termos de uso do
programa. Use apenas com a sua própria conta e por sua responsabilidade —
para desenvolvimento, o modo :meth:`ConnectMilesClient.mock` dispensa
credenciais.
"""
from __future__ import annotations

import http.cookiejar
import re
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Callable, Optional

from celestia_travel.models import MilesBalance

_BASE_URL = "https://www.connectmiles.com"
_TIMEOUT_SECONDS = 20
_CSRF_RE = re.compile(r'name="csrf_token"\s+value="([^"]+)"')
_BALANCE_RE = re.compile(r'id="available-miles"[^>]*>([^<]+)<')

# Transporte injetável: (url, dados_post_ou_None) -> corpo HTML
Transport = Callable[[str, Optional[dict]], str]


class MilesError(RuntimeError):
    """Falha de autenticação ou de parsing no programa de milhas."""


class ConnectMilesClient:
    def __init__(
        self,
        username: str,
        password: str,
        transport: Transport | None = None,
    ) -> None:
        self._username = username
        self._password = password
        self._transport = transport or self._build_default_transport()

    @staticmethod
    def _build_default_transport() -> Transport:
        cookie_jar = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(cookie_jar)
        )
        opener.addheaders = [
            (
                "User-Agent",
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            )
        ]

        def transport(url: str, data: Optional[dict]) -> str:
            encoded = urllib.parse.urlencode(data).encode() if data is not None else None
            with opener.open(url, data=encoded, timeout=_TIMEOUT_SECONDS) as response:
                return response.read().decode("utf-8", errors="replace")

        return transport

    def fetch_balance(self) -> MilesBalance:
        """Autentica e retorna o saldo de milhas da conta."""
        login_page = self._transport(f"{_BASE_URL}/login", None)
        csrf_match = _CSRF_RE.search(login_page)
        if not csrf_match:
            raise MilesError(
                "Token CSRF não encontrado na página de login do ConnectMiles — "
                "o layout pode ter mudado."
            )

        self._transport(
            f"{_BASE_URL}/login",
            {
                "username": self._username,
                "password": self._password,
                "csrf_token": csrf_match.group(1),
            },
        )

        account_page = self._transport(f"{_BASE_URL}/account", None)
        balance_match = _BALANCE_RE.search(account_page)
        if not balance_match:
            raise MilesError(
                "Saldo não encontrado na página da conta — login recusado ou layout alterado."
            )

        raw = balance_match.group(1)
        digits = re.sub(r"[^0-9]", "", raw)
        if not digits:
            raise MilesError(f"Saldo em formato inesperado: {raw!r}")

        return MilesBalance(
            program="ConnectMiles",
            miles=int(digits),
            updated_at=datetime.now(),
        )

    @classmethod
    def mock(cls, miles: int = 87450) -> MilesBalance:
        """Saldo de demonstração para desenvolvimento sem credenciais."""
        return MilesBalance(
            program="ConnectMiles (demo)",
            miles=miles,
            updated_at=datetime.now(),
        )
