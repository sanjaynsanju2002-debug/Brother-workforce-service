"""Serve known browser routes without turning missing API/assets into HTML."""
import json
import re
from pathlib import Path
from html import escape
from urllib.parse import quote

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from lib.db import db
from lib.jobs import open_jobs_query


DOMAIN = "https://brothersworkforcesolutions.in"


def _job_schema(job: dict, url: str) -> str:
    """Only advertise complete, on-page job descriptions as JobPosting data."""
    description = (job.get("description") or "").strip()
    normalized = description.lower()
    employer = (job.get("employer_name") or "").strip()
    if not employer or len(description) < 100 or not all(term in normalized for term in ("responsibilit", "qualification", "working hours")):
        return ""
    paragraphs = "".join(f"<p>{escape(line.strip())}</p>" for line in description.splitlines() if line.strip())
    posting = {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        "title": job["title"],
        "description": paragraphs,
        "datePosted": job["created_at"].date().isoformat(),
        "hiringOrganization": {"@type": "Organization", "name": employer},
        "jobLocation": {"@type": "Place", "address": {"@type": "PostalAddress", "addressLocality": job["location"], "addressCountry": "IN"}},
        "directApply": True,
        "url": url,
    }
    if job.get("closing_date"):
        posting["validThrough"] = f"{job['closing_date']}T23:59:59+05:30"
    data = json.dumps(posting, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    return f'<script type="application/ld+json">{data}</script>'


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

    def page_html(title: str, url: str, description: str | None = None) -> str:
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
        if description:
            safe_description = escape(description[:160], quote=True)
            for kind in ("name", "property"):
                key = "description" if kind == "name" else "og:description"
                pattern = rf'(<meta\s+{kind}="{key}"\s+content=")[^"]*(")'
                html = re.sub(pattern, lambda match: f"{match.group(1)}{safe_description}{match.group(2)}", html, count=1)
        return html

    @app.api_route("/sitemap.xml", methods=["GET", "HEAD"], include_in_schema=False)
    async def sitemap():
        jobs = await db.jobs.find(open_jobs_query(), {"_id": 0, "id": 1, "updated_at": 1, "created_at": 1}).to_list(500)
        urls = [f"<url><loc>{DOMAIN}/</loc></url>"]
        for job in jobs:
            loc = f"{DOMAIN}/jobs/{quote(job['id'], safe='')}"
            last_changed = job.get("updated_at") or job.get("created_at")
            lastmod = f"<lastmod>{last_changed.date().isoformat()}</lastmod>" if last_changed else ""
            urls.append(f"<url><loc>{escape(loc)}</loc>{lastmod}</url>")
        xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(urls) + "</urlset>"
        return Response(xml, media_type="application/xml", headers={"Cache-Control": "public, max-age=300"})

    @app.api_route("/privacy", methods=["GET", "HEAD"], include_in_schema=False)
    async def privacy_page():
        return HTMLResponse(
            page_html("Privacy Notice | Brothers Workforce Solutions", "https://brothersworkforcesolutions.in/privacy"),
            headers={"Cache-Control": "no-store"},
        )

    @app.api_route("/jobs/{job_id}", methods=["GET", "HEAD"], include_in_schema=False)
    async def job_page(job_id: str):
        job = await db.jobs.find_one({"id": job_id, **open_jobs_query()}, {"_id": 0})
        title = f"{job['title']} in {job['location']} | Brothers Workforce Solutions" if job else "Job Opening | Brothers Workforce Solutions"
        url = f"{DOMAIN}/jobs/{quote(job_id, safe='')}"
        description = (job.get("description") or "").strip() if job else ""
        snippet = (description or f"{job['title']} opening in {job['location']}. See role details and apply directly with Brothers Workforce Solutions.") if job else None
        html = page_html(title, url, snippet)
        if job:
            schema = _job_schema(job, url)
            if schema:
                html = html.replace("</head>", f"{schema}\n  </head>", 1)
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
