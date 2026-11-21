package web

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func site(t *testing.T) http.Handler {
	t.Helper()
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "assets"), 0o755)
	os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html>app</html>"), 0o644)
	os.WriteFile(filepath.Join(dir, "favicon.svg"), []byte("<svg/>"), 0o644)
	os.WriteFile(filepath.Join(dir, "assets", "app-abc.js"), []byte("console.log(1)"), 0o644)
	return Handler(dir, "https://id.example.com/")
}

func get(h http.Handler, path string, header ...string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("GET", path, nil)
	for i := 0; i+1 < len(header); i += 2 {
		req.Header.Set(header[i], header[i+1])
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestServesTheApp(t *testing.T) {
	h := site(t)
	for _, p := range []string{"/", "/users", "/organisations/o1/groups/g1", "/index.html"} {
		rec := get(h, p)
		if rec.Code != 200 || !strings.Contains(rec.Body.String(), "app") || rec.Header().Get("Cache-Control") != "no-cache" {
			t.Errorf("%s: %d %q %q", p, rec.Code, rec.Body, rec.Header().Get("Cache-Control"))
		}
	}
	if rec := get(h, "/favicon.svg"); rec.Body.String() != "<svg/>" {
		t.Errorf("a real file: %q", rec.Body)
	}
}

func TestAssets(t *testing.T) {
	h := site(t)
	rec := get(h, "/assets/app-abc.js")
	if rec.Code != 200 || !strings.Contains(rec.Header().Get("Cache-Control"), "immutable") {
		t.Errorf("%d %v", rec.Code, rec.Header())
	}
	if rec := get(h, "/assets/old-123.js"); rec.Code != 404 {
		t.Errorf("a missing asset should be 404 (not the app): %d", rec.Code)
	}
}

func TestConfigSaysWhereKestonIDIs(t *testing.T) {
	rec := get(site(t), "/config.json")
	if rec.Body.String() != `{"apiUrl":"","idUrl":"https://id.example.com"}` || rec.Header().Get("Cache-Control") != "no-store" {
		t.Errorf("%q %v", rec.Body, rec.Header())
	}
}

func TestCompresses(t *testing.T) {
	rec := get(site(t), "/assets/app-abc.js", "Accept-Encoding", "gzip")
	zr, err := gzip.NewReader(rec.Body)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(zr)
	if string(b) != "console.log(1)" || rec.Header().Get("Content-Length") != "" {
		t.Errorf("%q %v", b, rec.Header())
	}
}

func TestDoesNotEscapeTheFolder(t *testing.T) {
	if rec := get(site(t), "/../../etc/passwd"); strings.Contains(rec.Body.String(), "root:") {
		t.Error("read outside the folder")
	}
}

func TestReportOnlyCSP(t *testing.T) {
	h := site(t)
	rec := get(h, "/users")
	if got := rec.Header().Get("Content-Security-Policy"); got != "frame-ancestors 'none'" {
		t.Errorf("enforced CSP = %q", got)
	}
	ro := rec.Header().Get("Content-Security-Policy-Report-Only")
	for _, want := range []string{"script-src 'self'", "connect-src 'self' https://id.example.com;", "img-src 'self' data: blob: https://id.example.com;", "object-src 'none'", "report-uri /csp-report"} {
		if !strings.Contains(ro, want) {
			t.Errorf("report-only CSP %q is missing %q", ro, want)
		}
	}
	if strings.Contains(ro, "unsafe-") {
		t.Errorf("must not allow inline or eval: %q", ro)
	}
	if !strings.Contains(csp(""), "connect-src 'self' https:;") {
		t.Errorf("no Keston ID address should fall back to https: %q", csp(""))
	}
}

func TestCSPReportEndpoint(t *testing.T) {
	h := site(t)
	req := httptest.NewRequest("POST", "/csp-report", strings.NewReader(`{"csp-report":{}}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 204 {
		t.Errorf("status = %d, want 204", rec.Code)
	}
}
