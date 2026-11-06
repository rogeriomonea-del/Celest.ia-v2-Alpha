import socket
from pathlib import Path

import pytest

pytest_plugins = ["pytester"]

_CONFTEST = Path(__file__).with_name("conftest.py")


def test_real_socket_connect_is_blocked(_no_network):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        with pytest.raises(RuntimeError, match="rede bloqueada"):
            sock.connect(("127.0.0.1", 9))
    assert _no_network == [("connect", ("127.0.0.1", 9))]
    _no_network.clear()  # tentativa deliberada: não deve falhar este teste


def test_guard_records_connect_ex_and_remote_dns(_no_network):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        with pytest.raises(RuntimeError, match="rede bloqueada"):
            sock.connect_ex(("10.0.0.1", 443))
    with pytest.raises(RuntimeError, match="rede bloqueada"):
        socket.getaddrinfo("api.firecrawl.dev", 443)
    assert _no_network == [
        ("connect_ex", ("10.0.0.1", 443)),
        ("getaddrinfo", "api.firecrawl.dev"),
    ]
    _no_network.clear()


def test_guard_lets_local_dns_through(_no_network):
    socket.getaddrinfo("localhost", 80)
    socket.getaddrinfo("127.0.0.1", 80)
    assert _no_network == []


def test_swallowed_network_attempt_still_fails_the_test(pytester):
    # o mesmo conftest num projeto isolado: um provider que engole o erro
    # (``except Exception``) não pode deixar o teste passar em silêncio
    pytester.makeconftest(_CONFTEST.read_text(encoding="utf-8"))
    pytester.makepyfile(
        test_swallow="""
        import socket

        def test_swallows_dns():
            try:
                socket.getaddrinfo("api.seats.aero", 443)
            except Exception:
                pass

        def test_swallows_connect():
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                try:
                    sock.connect(("127.0.0.1", 9))
                except Exception:
                    pass

        def test_offline_is_fine():
            assert True
        """
    )
    result = pytester.runpytest("-p", "no:cacheprovider")
    result.assert_outcomes(passed=3, errors=2)
    result.stdout.fnmatch_lines(["*teste tentou acessar a rede*api.seats.aero*"])
