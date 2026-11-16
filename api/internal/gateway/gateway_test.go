package gateway

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/thekestongroup/admin/api/internal/upstream"
)

// fakeID stands in for Keston ID: it answers the bulk endpoints and records
// what it was sent.
func fakeID(t *testing.T) (*httptest.Server, *[]string) {
	t.Helper()
	var seen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		seen = append(seen, r.Method+" "+r.URL.Path+" auth="+r.Header.Get("Authorization")+
			" cookie="+r.Header.Get("Cookie")+" "+string(body))
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "/bulk/disable"):
			_, _ = w.Write([]byte(`{"results":[{"id":"u1","name":"Ann","email":"a@x","result":"done"},` +
				`{"id":"u2","name":"Bob","email":"b@x","result":"skipped","reason":"Not found."}]}`))
		case strings.HasSuffix(r.URL.Path, "/bulk/groups"):
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"error":"no_permission","message":"No."}`))
		default:
			_, _ = w.Write([]byte(`{"hello":"id"}`))
		}
	}))
	t.Cleanup(srv.Close)
	return srv, &seen
}

func gw(t *testing.T, id *httptest.Server) http.Handler {
	t.Helper()
	reg, err := upstream.Parse("id=" + id.URL)
	if err != nil {
		t.Fatal(err)
	}
	app := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("the app")) })
	return New(reg, app).Handler()
}

func TestPassesRequestsOnWithTheToken(t *testing.T) {
	id, seen := fakeID(t)
	req := httptest.NewRequest("GET", "/api/organisations", nil)
	req.Header.Set("Authorization", "Bearer abc")
	req.Header.Set("Cookie", "session=secret")
	rec := httptest.NewRecorder()
	gw(t, id).ServeHTTP(rec, req)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "hello") {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	got := (*seen)[0]
	if !strings.Contains(got, "auth=Bearer abc") || !strings.Contains(got, "cookie= ") {
		t.Errorf("token should go on and cookies should not: %s", got)
	}
	if rec.Header().Get("X-Request-Id") == "" {
		t.Error("no request id")
	}
}

func TestBulkUpdateSplitsAndMerges(t *testing.T) {
	id, seen := fakeID(t)
	req := httptest.NewRequest("POST", "/api/organisations/o1/users/bulk-update",
		strings.NewReader(`{"userIds":["u1","u2"],"status":"disabled","groups":{"add":["g1"]}}`))
	req.Header.Set("Authorization", "Bearer abc")
	rec := httptest.NewRecorder()
	gw(t, id).ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	var out struct {
		Results []struct {
			ID      string
			Outcome map[string]struct{ Result, Reason string }
		}
		Errors map[string]json.RawMessage
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Results) != 2 || out.Results[0].ID != "u1" ||
		out.Results[0].Outcome["status"].Result != "done" ||
		out.Results[1].Outcome["status"].Reason != "Not found." {
		t.Errorf("results: %s", rec.Body)
	}
	if _, ok := out.Errors["groups"]; !ok {
		t.Errorf("a refused part should be in errors: %s", rec.Body)
	}
	if len(*seen) != 2 || !strings.Contains((*seen)[0], "/o1/users/bulk/disable") ||
		!strings.Contains((*seen)[1], `"add":["g1"]`) {
		t.Errorf("sent to id: %v", *seen)
	}
}

func TestBulkUpdateNeedsAToken(t *testing.T) {
	id, _ := fakeID(t)
	rec := httptest.NewRecorder()
	gw(t, id).ServeHTTP(rec, httptest.NewRequest("POST", "/api/organisations/o1/users/bulk-update", strings.NewReader(`{}`)))
	if rec.Code != 401 {
		t.Errorf("got %d", rec.Code)
	}
}

func TestServesTheAppAndOnlyServesTheAPIUnderAPI(t *testing.T) {
	id, seen := fakeID(t)
	h := gw(t, id)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/users", nil))
	if rec.Body.String() != "the app" {
		t.Errorf("an app route should be the app: %q", rec.Body)
	}
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/v1/organisations", nil))
	if rec.Body.String() != "the app" || len(*seen) != 0 {
		t.Errorf("/v1 isn't the API here: %q %v", rec.Body, *seen)
	}
}
