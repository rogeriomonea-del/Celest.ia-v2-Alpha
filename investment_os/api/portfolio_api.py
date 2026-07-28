"""API v1 da Fase 5: perfil, IPS, importação, carteira e rebalanceamento.

Contratos tipados (pydantic), erros estruturados sem informação sensível,
upload limitado, confirmações explícitas. Autorização: o esquema Bearer está
declarado no contrato (preparado); a autenticação completa fica para a fase de
produção — a API do MVP é local e single-user (ADR-0004).
"""
from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .. import config
from ..portfolio import db as pdb
from ..portfolio import importer
from ..portfolio import profile as prof
from ..portfolio.analysis import analyze_snapshot
from ..portfolio.profile import PolicyRequiredError
from ..portfolio.rebalance import build_plan

router = APIRouter(prefix="/v1", tags=["fase5"])


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message})


def get_conn():
    conn = pdb.connect()
    try:
        yield conn
    finally:
        conn.close()


def ensure_profile(conn) -> int:
    """MVP single-user: perfil 1 + carteira 1 criados sob demanda."""
    if conn.execute("SELECT 1 FROM investor_profile WHERE id=1").fetchone() is None:
        conn.execute("INSERT INTO investor_profile (id, created_at) VALUES (1, ?)", (pdb.utcnow(),))
        conn.execute(
            "INSERT INTO portfolio (id, profile_id, created_at, name) VALUES (1, 1, ?, 'principal')",
            (pdb.utcnow(),),
        )
        conn.commit()
    return 1


# ------------------------------------------------------------------ perfil


class AnswersIn(BaseModel):
    answers: dict[str, str] = Field(default_factory=dict, description="id da questão -> opção")


class QuestionOut(BaseModel):
    id: str
    dimension: str
    text: str
    options: list[str]


@router.post("/profile/questions", response_model=list[QuestionOut])
def pending_questions(body: AnswersIn) -> Any:
    return prof.next_questions(body.answers)


@router.post("/profile/assess")
def assess(body: AnswersIn, conn=Depends(get_conn)) -> dict:
    pid = ensure_profile(conn)
    result = prof.assess(conn, pid, body.answers)
    result["answers"] = body.answers
    return result


@router.get("/profile/assessment/latest")
def latest_assessment(conn=Depends(get_conn)) -> dict:
    row = conn.execute(
        "SELECT * FROM profile_assessment ORDER BY id DESC LIMIT 1"
    ).fetchone()
    if row is None:
        raise _error(404, "no_assessment", "nenhuma avaliação de perfil registrada")
    import json

    return {
        "assessment_id": row["id"], "created_at": row["created_at"],
        "scores": json.loads(row["dimension_scores_json"]),
        "conflicts": json.loads(row["conflicts_json"]),
        "confidence": row["confidence"],
    }


# -------------------------------------------------------------------- IPS


class PolicyDraftIn(BaseModel):
    reason: str = Field(min_length=3, description="motivo da criação/alteração")
    author: str = "usuario"
    content: dict | None = Field(
        default=None,
        description="IPS editada; se ausente, deriva da última avaliação de perfil",
    )


@router.post("/policy/draft")
def policy_draft(body: PolicyDraftIn, conn=Depends(get_conn)) -> dict:
    pid = ensure_profile(conn)
    content = body.content
    if content is None:
        row = conn.execute("SELECT * FROM profile_assessment ORDER BY id DESC LIMIT 1").fetchone()
        if row is None:
            raise _error(409, "no_assessment", "responda o questionário antes de gerar a IPS")
        import json

        assessment = {
            "assessment_id": row["id"],
            "scores": json.loads(row["dimension_scores_json"]),
            "conflicts": json.loads(row["conflicts_json"]),
            "confidence": row["confidence"],
            "answers": json.loads(row["answers_json"]),
        }
        content = prof.generate_ips(assessment)
    try:
        version = prof.create_policy_version(conn, pid, content, body.reason, body.author)
    except ValueError as exc:
        raise _error(422, "ips_invalida", str(exc))
    return {**version, "content": content}


@router.get("/policy/versions")
def policy_versions(conn=Depends(get_conn)) -> list[dict]:
    import json

    return [
        {"version_id": r["id"], "version": r["version"], "status": r["status"],
         "created_at": r["created_at"], "author": r["author"], "reason": r["reason"],
         "prev_version": r["prev_version"], "confirmed_at": r["confirmed_at"],
         "content": json.loads(r["content_json"])}
        for r in conn.execute("SELECT * FROM policy_version ORDER BY version DESC")
    ]


@router.post("/policy/{version_id}/confirm")
def policy_confirm(version_id: int, conn=Depends(get_conn)) -> dict:
    try:
        return prof.confirm_policy(conn, version_id)
    except ValueError as exc:
        status = 404 if "não encontrada" in str(exc) else 409
        raise _error(status, "confirm_rejected", str(exc))


@router.get("/policy/confirmed")
def policy_confirmed(conn=Depends(get_conn)) -> dict:
    pid = ensure_profile(conn)
    cp = prof.confirmed_policy(conn, pid)
    if cp is None:
        raise _error(404, "no_confirmed_policy",
                     "nenhuma IPS confirmada; recomendações permanecem bloqueadas")
    return cp


# -------------------------------------------------------------- importação


@router.post("/portfolio/import")
async def start_import(file: UploadFile, conn=Depends(get_conn)) -> dict:
    ensure_profile(conn)
    if file.filename is None:
        raise _error(422, "missing_filename", "nome do arquivo ausente")
    tmp_dir = Path(tempfile.mkdtemp(prefix="iios_upload_", dir=config.DATA_DIR))
    tmp_path = tmp_dir / "upload.bin"
    size = 0
    with open(tmp_path, "wb") as out:
        while chunk := await file.read(1 << 20):
            size += len(chunk)
            if size > importer.MAX_UPLOAD_BYTES:
                out.close()
                tmp_path.unlink(missing_ok=True)
                tmp_dir.rmdir()
                raise _error(413, "file_too_large",
                             f"limite de {importer.MAX_UPLOAD_BYTES // (1024 * 1024)}MB excedido")
            out.write(chunk)
    try:
        return importer.start_import(conn, 1, tmp_path, file.filename)
    except importer.ImportError_ as exc:
        raise _error(422, "import_invalid", str(exc))
    finally:
        tmp_path.unlink(missing_ok=True)
        try:
            tmp_dir.rmdir()
        except OSError:
            pass


@router.get("/portfolio/import/{import_id}/preview")
def import_preview(import_id: int, conn=Depends(get_conn)) -> dict:
    try:
        return importer.preview(conn, import_id)
    except importer.ImportError_ as exc:
        raise _error(404, "import_not_found", str(exc))


class CorrectRowIn(BaseModel):
    ticker: str = Field(min_length=1, max_length=12)
    asset_class: Literal["acao_br", "fii", "bdr", "etf", "renda_fixa", "outro"] | None = None


@router.post("/portfolio/import/{import_id}/rows/{row_id}/correct")
def import_correct(import_id: int, row_id: int, body: CorrectRowIn, conn=Depends(get_conn)) -> dict:
    try:
        return importer.correct_row(conn, import_id, row_id, body.ticker, body.asset_class)
    except importer.ImportError_ as exc:
        raise _error(404, "row_not_found", str(exc))


class ConfirmIn(BaseModel):
    accept_partial: bool = Field(
        default=False,
        description="obrigatório true para confirmar com linhas problemáticas excluídas",
    )


@router.post("/portfolio/import/{import_id}/confirm")
def import_confirm(import_id: int, body: ConfirmIn, conn=Depends(get_conn)) -> dict:
    try:
        return importer.confirm_import(conn, import_id, accept_partial=body.accept_partial)
    except importer.ImportError_ as exc:
        raise _error(409, "confirm_rejected", str(exc))


# ----------------------------------------------------------------- carteira


@router.get("/portfolio/snapshots")
def snapshots(conn=Depends(get_conn)) -> list[dict]:
    return [
        dict(r) for r in conn.execute(
            "SELECT id, portfolio_id, import_id, version, created_at, data_base"
            " FROM portfolio_snapshot ORDER BY version DESC"
        )
    ]


@router.get("/portfolio/snapshots/{snapshot_id}")
def snapshot_positions(snapshot_id: int, conn=Depends(get_conn)) -> dict:
    snap = conn.execute("SELECT * FROM portfolio_snapshot WHERE id=?", (snapshot_id,)).fetchone()
    if snap is None:
        raise _error(404, "snapshot_not_found", "snapshot não encontrado")
    return {
        "snapshot": dict(snap),
        "positions": [dict(r) for r in conn.execute(
            "SELECT * FROM position WHERE snapshot_id=?", (snapshot_id,)
        )],
    }


@router.get("/portfolio/snapshots/{snapshot_id}/analysis")
def snapshot_analysis(snapshot_id: int, conn=Depends(get_conn)) -> dict:
    pid = ensure_profile(conn)
    policy = prof.confirmed_policy(conn, pid)
    try:
        return analyze_snapshot(conn, snapshot_id, policy["content"] if policy else None)
    except ValueError as exc:
        raise _error(404, "snapshot_not_found", str(exc))


class RebalanceIn(BaseModel):
    months: int = Field(default=6, ge=1, le=24)


@router.post("/portfolio/snapshots/{snapshot_id}/rebalance")
def rebalance(snapshot_id: int, body: RebalanceIn, conn=Depends(get_conn)) -> dict:
    pid = ensure_profile(conn)
    try:
        return build_plan(conn, pid, snapshot_id, months=body.months)
    except PolicyRequiredError as exc:
        raise _error(409, "policy_not_confirmed", exc.message)
    except ValueError as exc:
        raise _error(404, "snapshot_not_found", str(exc))


@router.get("/portfolio/issues")
def issues(conn=Depends(get_conn)) -> list[dict]:
    return [dict(r) for r in conn.execute(
        "SELECT * FROM data_quality_issue ORDER BY id DESC LIMIT 200"
    )]
