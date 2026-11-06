import socket

import pytest


def test_real_socket_connect_is_blocked():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        with pytest.raises(RuntimeError, match="rede bloqueada"):
            sock.connect(("127.0.0.1", 9))
