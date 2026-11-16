// Package web serves the Keston Admin web app (the built files in a folder):
// index.html for the app's own routes, long caching for hashed files, and
// /config.json, which tells the app where Keston ID is.
package web

import (
	"compress/gzip"
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// Handler serves the app in dir. idURL is Keston ID's public address, for the
// app to sign in with ("" lets the app work it out from its own address).
func Handler(dir, idURL string) http.Handler {
	config, _ := json.Marshal(map[string]string{"idUrl": strings.TrimRight(idURL, "/"), "apiUrl": ""})
	return gzipped(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Content-Security-Policy", "frame-ancestors 'none'")

		p := path.Clean("/" + r.URL.Path)
		switch {
		case p == "/config.json":
			h.Set("Content-Type", "application/json")
			h.Set("Cache-Control", "no-store")
			_, _ = w.Write(config)
			return
		case strings.HasPrefix(p, "/assets/"):
			// Hashed file names: safe to cache for a year. One from an older
			// version is gone: say so (404), rather than sending index.html,
			// so the app can tell and reload (lib/staleBuild.ts).
			if serveFile(w, r, filepath.Join(dir, filepath.FromSlash(p))) {
				h.Set("Cache-Control", "public, max-age=31536000, immutable")
				return
			}
			http.NotFound(w, r)
			return
		}
		if p != "/" && p != "/index.html" && serveFile(w, r, filepath.Join(dir, filepath.FromSlash(p))) {
			return
		}
		// The app's own routes.
		h.Set("Cache-Control", "no-cache")
		serveFile(w, r, filepath.Join(dir, "index.html"))
	}))
}

// serveFile sends a file, or says false (nothing sent) when it isn't one.
func serveFile(w http.ResponseWriter, r *http.Request, name string) bool {
	f, err := os.Open(name)
	if err != nil {
		return false
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil || st.IsDir() {
		return false
	}
	if ct := mime.TypeByExtension(filepath.Ext(name)); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	http.ServeContent(w, r, name, st.ModTime(), f)
	return true
}

type gzipWriter struct {
	http.ResponseWriter
	gz *gzip.Writer
}

func (g gzipWriter) Write(b []byte) (int, error) { return g.gz.Write(b) }

// The compressed length isn't the file's.
func (g gzipWriter) WriteHeader(code int) {
	g.Header().Del("Content-Length")
	g.ResponseWriter.WriteHeader(code)
}

// gzipped compresses text responses for browsers that accept it.
func gzipped(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") || r.Method == http.MethodHead ||
			!compressible(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Add("Vary", "Accept-Encoding")
		gz := gzip.NewWriter(io.Discard)
		gz.Reset(w)
		defer gz.Close()
		next.ServeHTTP(gzipWriter{ResponseWriter: w, gz: gz}, r)
	})
}

func compressible(p string) bool {
	switch strings.ToLower(path.Ext(p)) {
	case "", ".html", ".js", ".css", ".json", ".svg", ".txt", ".map":
		return true
	}
	return false
}
