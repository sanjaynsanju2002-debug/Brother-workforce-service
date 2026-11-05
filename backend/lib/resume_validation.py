"""Validate resume signatures and reject active Office content before storage."""
from io import BytesIO
from zipfile import ZipFile, BadZipFile
from fastapi import HTTPException


def resume_media(ext: str, contents: bytes) -> str:
    types = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
    valid = False
    if ext == ".pdf":
        valid = contents.startswith(b"%PDF-")
    elif ext == ".png":
        valid = contents.startswith(b"\x89PNG\r\n\x1a\n")
    elif ext in {".jpg", ".jpeg"}:
        valid = contents.startswith(b"\xff\xd8\xff")
    elif ext == ".docx":
        try:
            with ZipFile(BytesIO(contents)) as archive:
                entries = archive.infolist()
                names = {entry.filename for entry in entries}
                valid = {"[Content_Types].xml", "word/document.xml"}.issubset(names)
                valid = valid and len(entries) <= 500 and sum(e.file_size for e in entries) <= 20 * 1024 * 1024
                valid = valid and not any("vbaproject" in n.lower() or n.startswith("word/embeddings/") or ".." in n.split("/") for n in names)
        except (BadZipFile, ValueError):
            valid = False
    if not valid:
        raise HTTPException(422, "Choose a valid PDF, DOCX, PNG or JPEG resume. Legacy DOC and macro-enabled files are not accepted; export them to PDF.")
    return types[ext]
