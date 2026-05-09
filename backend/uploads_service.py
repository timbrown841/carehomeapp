"""Safelyn Systems — File upload service.

Local-disk file storage with auth-protected serving via /api/files/{file_id}.
Backed by a `files` collection that stores metadata only.

Constraints (per product decisions):
- Max 10MB per file
- Allowed MIME: PDF, DOCX, PNG, JPG/JPEG
- Files stored on disk under /app/backend/uploads/{kind}/{uuid}.{ext}
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Literal

from fastapi import HTTPException, UploadFile

UPLOAD_ROOT = Path(__file__).parent / "uploads"
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

ALLOWED_DOC_MIME = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/png",
    "image/jpeg",
}
ALLOWED_PHOTO_MIME = {"image/png", "image/jpeg"}

EXT_BY_MIME = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "image/png": "png",
    "image/jpeg": "jpg",
}

FileKind = Literal["photo", "document", "return_interview"]

KIND_DIR = {
    "photo": "photos",
    "document": "documents",
    "return_interview": "return_interviews",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def save_upload(
    file: UploadFile,
    kind: FileKind,
    uploaded_by: dict,
    db,
    photo_only: bool = False,
) -> dict:
    """Stream-save an UploadFile to disk and persist metadata in `files`.

    Returns the file metadata dict (id, url, ...).
    Raises HTTPException on validation failure.
    """
    allowed = ALLOWED_PHOTO_MIME if photo_only else ALLOWED_DOC_MIME
    mime = (file.content_type or "").lower()
    if mime not in allowed:
        raise HTTPException(415, f"Unsupported file type: {mime or 'unknown'}")

    ext = EXT_BY_MIME[mime]
    file_id = str(uuid.uuid4())
    sub = KIND_DIR[kind]
    dest_dir = UPLOAD_ROOT / sub
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{file_id}.{ext}"

    # Stream and enforce max size
    size = 0
    chunk_size = 1024 * 256
    with dest.open("wb") as out:
        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_FILE_SIZE:
                out.close()
                try:
                    dest.unlink(missing_ok=True)
                except Exception:
                    pass
                raise HTTPException(413, "File exceeds 10 MB limit")
            out.write(chunk)

    meta = {
        "id": file_id,
        "kind": kind,
        "ext": ext,
        "mime": mime,
        "size": size,
        "original_name": file.filename or f"{file_id}.{ext}",
        "stored_path": str(dest.relative_to(UPLOAD_ROOT)),
        "uploaded_by_id": uploaded_by.get("id"),
        "uploaded_by_name": uploaded_by.get("name"),
        "created_at": _now_iso(),
    }
    await db.files.insert_one(meta.copy())
    meta["url"] = f"/api/files/{file_id}"
    return meta


def disk_path(meta: dict) -> Optional[Path]:
    if not meta:
        return None
    sp = meta.get("stored_path")
    if not sp:
        return None
    p = UPLOAD_ROOT / sp
    return p if p.exists() else None


def public_meta(meta: dict) -> dict:
    """Strip internal storage fields for client-side responses."""
    if not meta:
        return {}
    return {
        "id": meta.get("id"),
        "kind": meta.get("kind"),
        "mime": meta.get("mime"),
        "size": meta.get("size"),
        "original_name": meta.get("original_name"),
        "uploaded_by_name": meta.get("uploaded_by_name"),
        "created_at": meta.get("created_at"),
        "url": f"/api/files/{meta.get('id')}",
    }
