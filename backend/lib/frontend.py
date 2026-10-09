"""Serve known browser routes without turning missing API/assets into HTML."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


class WebsiteFiles(StaticFiles):
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        # Let installed clients discover new releases on their next visit.
        if response.headers.get("content-type", "").startswith("text/html"):
            response.headers["Cache-Control"] = "no-store, max-age=0"
        elif path in {"sw.js", "install.js", "manifest.webmanifest"}:
            response.headers["Cache-Control"] = "no-cache"
        return response


def mount_frontend(app: FastAPI, directory: Path) -> None:
    if not directory.exists():
        return

    @app.api_route("/admin", methods=["GET", "HEAD"], include_in_schema=False)
    @app.api_route("/admin/", methods=["GET", "HEAD"], include_in_schema=False)
    @app.api_route("/admin/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def admin_page(path: str = ""):
        return FileResponse(directory / "index.html", headers={"Cache-Control": "no-store"})

    @app.api_route("/app", methods=["GET", "HEAD"], include_in_schema=False)
    @app.api_route("/app/", methods=["GET", "HEAD"], include_in_schema=False)
    async def app_page():
        return FileResponse(directory / "app.html", headers={"Cache-Control": "no-cache"})

    app.mount("/", WebsiteFiles(directory=directory, html=True), name="frontend")
