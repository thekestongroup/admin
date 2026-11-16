package gateway

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/url"

	"github.com/thekestongroup/admin/api/internal/upstream"
)

// ── POST /v1/organisations/{orgID}/users/bulk-update ─────────────────────
//
// Change many people at once, in any mix of ways, in one request:
//
//	{
//	  "userIds": ["…", "…"],
//	  "status": "disabled",                              // or "active"
//	  "groups": {"add": ["groupId"], "remove": ["groupId"]},
//	  "resetPassword": {"password": "", "requirePasswordChange": true}
//	}
//
// Each part goes to the service that owns it (today all of them are Keston
// ID's; when another app owns one, change its step's service) and the
// answers come back as one, a line per person:
//
//	{"results": [{"id","name","email","outcome":{"status":{"result":"done"},…}}],
//	 "errors": {"groups": {"error":"no_permission","message":"…"}}}
//
// A part the service refuses (no permission, a bad group) is in errors; the
// other parts still run. Keston ID applies its own rules to every part with
// the caller's token, as it does for each action on its own.

const maxBulkUsers = 500

type bulkUpdate struct {
	UserIDs []string `json:"userIds"`
	Status  string   `json:"status"`
	Groups  *struct {
		Add    []string `json:"add"`
		Remove []string `json:"remove"`
	} `json:"groups"`
	ResetPassword *struct {
		Password              string `json:"password"`
		RequirePasswordChange *bool  `json:"requirePasswordChange"`
	} `json:"resetPassword"`
}

// step: one part of the update, for one service.
type step struct {
	name    string
	service string
	path    string
	body    map[string]any
}

type bulkRow struct {
	ID      string                 `json:"id"`
	Name    string                 `json:"name"`
	Email   string                 `json:"email"`
	Outcome map[string]stepOutcome `json:"outcome"`
}

type stepOutcome struct {
	Result   string `json:"result"`
	Reason   string `json:"reason,omitempty"`
	Password string `json:"password,omitempty"`
}

func (g *Gateway) bulkUpdate(w http.ResponseWriter, r *http.Request) {
	token, ok := bearer(r)
	if !ok {
		upstream.WriteError(w, http.StatusUnauthorized, "signed_out", "Sign in to continue.")
		return
	}
	var in bulkUpdate
	r.Body = http.MaxBytesReader(w, r.Body, 256<<10)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		upstream.WriteError(w, http.StatusBadRequest, "bad_request", "Couldn't read the request.")
		return
	}
	if len(in.UserIDs) == 0 {
		upstream.WriteError(w, http.StatusBadRequest, "bad_request", "Choose at least one user.")
		return
	}
	if len(in.UserIDs) > maxBulkUsers {
		upstream.WriteError(w, http.StatusBadRequest, "bad_request", "Choose up to 500 users at a time.")
		return
	}

	base := "/v1/organisations/" + url.PathEscape(r.PathValue("orgID")) + "/users/bulk"
	var steps []step
	switch in.Status {
	case "":
	case "disabled":
		steps = append(steps, step{"status", "id", base + "/disable", map[string]any{"userIds": in.UserIDs}})
	case "active":
		steps = append(steps, step{"status", "id", base + "/enable", map[string]any{"userIds": in.UserIDs}})
	default:
		upstream.WriteError(w, http.StatusUnprocessableEntity, "invalid", `status is "active" or "disabled".`)
		return
	}
	if in.Groups != nil && len(in.Groups.Add)+len(in.Groups.Remove) > 0 {
		steps = append(steps, step{"groups", "id", base + "/groups", map[string]any{
			"userIds": in.UserIDs, "add": nonNil(in.Groups.Add), "remove": nonNil(in.Groups.Remove)}})
	}
	if rp := in.ResetPassword; rp != nil {
		body := map[string]any{"userIds": in.UserIDs, "password": rp.Password}
		if rp.RequirePasswordChange != nil {
			body["requirePasswordChange"] = *rp.RequirePasswordChange
		}
		steps = append(steps, step{"resetPassword", "id", base + "/reset-password", body})
	}
	if len(steps) == 0 {
		upstream.WriteError(w, http.StatusBadRequest, "bad_request", "Choose something to change.")
		return
	}

	rows := map[string]*bulkRow{}
	errs := map[string]json.RawMessage{}
	for _, s := range steps {
		svc := g.services.Get(s.service)
		res, err := svc.Do(r.Context(), http.MethodPost, s.path, token, idOf(r), s.body)
		if err != nil {
			slog.Error("bulk step failed", "step", s.name, "service", s.service, "error", err, "request", idOf(r))
			upstream.WriteError(w, http.StatusBadGateway, "service_unavailable",
				"A service isn't answering. Nothing after "+s.name+" was done; check what was, and try again.")
			return
		}
		if res.Status == http.StatusUnauthorized {
			// Signed out: nothing will work; say so as the service did.
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(res.Status)
			_, _ = w.Write(res.Body)
			return
		}
		if !res.OK() {
			errs[s.name] = res.Body
			continue
		}
		var out struct {
			Results []struct {
				ID       string `json:"id"`
				Name     string `json:"name"`
				Email    string `json:"email"`
				Result   string `json:"result"`
				Reason   string `json:"reason"`
				Password string `json:"password"`
			} `json:"results"`
		}
		if err := json.Unmarshal(res.Body, &out); err != nil {
			slog.Error("bulk step: unreadable answer", "step", s.name, "service", s.service, "request", idOf(r))
			errs[s.name] = json.RawMessage(`{"error":"server_error","message":"Couldn't read the answer."}`)
			continue
		}
		for _, o := range out.Results {
			row := rows[o.ID]
			if row == nil {
				row = &bulkRow{ID: o.ID, Name: o.Name, Email: o.Email, Outcome: map[string]stepOutcome{}}
				rows[o.ID] = row
			}
			row.Outcome[s.name] = stepOutcome{Result: o.Result, Reason: o.Reason, Password: o.Password}
		}
	}

	// In the order they were asked for.
	results := make([]*bulkRow, 0, len(in.UserIDs))
	seen := map[string]bool{}
	for _, id := range in.UserIDs {
		if row := rows[id]; row != nil && !seen[id] {
			results = append(results, row)
			seen[id] = true
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]any{"results": results, "errors": errs})
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
