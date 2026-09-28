"""Run after the frontend build: python -m unittest discover -s tests -p 'test_frontend_routes.py'."""
import sys
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from lib.frontend import mount_frontend


class FrontendRoutes(unittest.TestCase):
    def setUp(self):
        app = FastAPI()

        @app.get("/api/health")
        def health():
            return {"ok": True}

        mount_frontend(app, ROOT / "frontend" / "dist")
        self.client = TestClient(app)

    def test_direct_browser_routes(self):
        for path in ["/", "/admin", "/admin/", "/app", "/app/"]:
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200, path)
            self.assertIn("text/html", response.headers["content-type"])
        self.assertIn('id="root"', self.client.get("/admin").text)
        self.assertIn("Register for work", self.client.get("/app").text)
        self.assertEqual(self.client.head("/admin").status_code, 200)

    def test_api_and_missing_assets_are_not_app_shell(self):
        self.assertEqual(self.client.get("/api/health").json(), {"ok": True})
        for path in ["/api/missing", "/assets/missing.js", "/not-a-page"]:
            self.assertEqual(self.client.get(path).status_code, 404, path)

    def test_install_resources_and_update_headers(self):
        manifest = self.client.get("/manifest.webmanifest")
        self.assertEqual(manifest.status_code, 200)
        self.assertIn("manifest", manifest.headers["content-type"])
        data = manifest.json()
        self.assertEqual(self.client.get(data["start_url"]).status_code, 200)
        for icon in data["icons"]:
            response = self.client.get(icon["src"])
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["content-type"], "image/png")
        for path in ["/sw.js", "/manifest.webmanifest", "/install.js", "/app", "/offline.html"]:
            self.assertEqual(self.client.get(path).headers["cache-control"], "no-cache", path)
        self.assertEqual(self.client.get("/admin").headers["cache-control"], "no-store")


if __name__ == "__main__":
    unittest.main()
