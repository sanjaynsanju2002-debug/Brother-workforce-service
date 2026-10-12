"""Serve known browser routes without turning missing API/assets into HTML."""
from pathlib import Path
from html import escape

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from lib.db import db


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

    def page_html(title: str, url: str) -> str:
        html = (directory / "index.html").read_text(encoding="utf-8")
        html = html.replace(
            "Brothers Workforce Solutions | Manpower Services in Mysuru, Karnataka",
            escape(title, quote=True),
        )
        html = html.replace(
            '<link rel="canonical" href="https://brothersworkforcesolutions.in/" />',
            f'<link rel="canonical" href="{escape(url, quote=True)}" />',
        )
        html = html.replace(
            '<meta property="og:url" content="https://brothersworkforcesolutions.in/" />',
            f'<meta property="og:url" content="{escape(url, quote=True)}" />',
        )
        return html

    @app.api_route("/privacy", methods=["GET", "HEAD"], include_in_schema=False)
    async def privacy_page():
        return HTMLResponse(
            page_html("Privacy Notice | Brothers Workforce Solutions", "https://brothersworkforcesolutions.in/privacy"),
            headers={"Cache-Control": "no-store"},
        )

    @app.api_route("/jobs/{job_id}", methods=["GET", "HEAD"], include_in_schema=False)
    async def job_page(job_id: str):
        job = await db.jobs.find_one({"id": job_id, "active": True}, {"_id": 0, "title": 1, "location": 1})
        title = f"{job['title']} in {job['location']} | Brothers Workforce Solutions" if job else "Job Opening | Brothers Workforce Solutions"
        html = page_html(title, f"https://brothersworkforcesolutions.in/jobs/{job_id}")
        if not job:
            html = html.replace(
                'content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"',
                'content="noindex, follow"',
            )
        return HTMLResponse(html, status_code=200 if job else 404, headers={"Cache-Control": "no-store"})

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
