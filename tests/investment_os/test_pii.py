"""PII scrubber determinístico — nunca depende de LLM."""
from investment_os.portfolio.pii import contains_pii, scrub_text


class TestScrub:
    def test_cpf_mascarado(self):
        r = scrub_text("Titular CPF 123.456.789-01 posição")
        assert "123.456" not in r.text and r.kinds.get("cpf") == 1

    def test_cpf_sem_mascara(self):
        r = scrub_text("CPF: 12345678901")
        assert "12345678901" not in r.text

    def test_cnpj_de_emissor_preservado(self):
        # CNPJ (14 dígitos) é identificador de emissor, não PII.
        r = scrub_text("Emissor CNPJ 33.592.510/0001-54")
        assert "33.592.510/0001-54" in r.text

    def test_email_telefone_cep(self):
        r = scrub_text("contato: fulano@exemplo.com tel (11) 91234-5678 CEP 01310-100")
        assert "@" not in r.text.replace("[EMAIL REMOVIDO]", "")
        assert "91234" not in r.text
        assert "01310-100" not in r.text
        assert r.removed_count == 3

    def test_conta_agencia_codigo_investidor(self):
        r = scrub_text("Agência: 1234 Conta: 56789-0 Código de investidor: 987654")
        assert "56789" not in r.text and "987654" not in r.text and "1234" not in r.text

    def test_endereco(self):
        r = scrub_text("Rua das Flores, 123\nposições abaixo")
        assert "Flores" not in r.text and "posições abaixo" in r.text

    def test_texto_limpo_intocado(self):
        s = "VALE3 100 acoes preco medio 61,50"
        r = scrub_text(s)
        assert r.text == s and r.removed_count == 0

    def test_deteccao(self):
        assert contains_pii("cpf 111.222.333-44")
        assert not contains_pii("PETR4 200")

    def test_deterministico(self):
        s = "CPF 123.456.789-01 e email a@b.com"
        assert scrub_text(s).text == scrub_text(s).text
