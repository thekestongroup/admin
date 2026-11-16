// Package upstream is how Keston API talks to the services behind it
// (Keston ID, and Keston's other apps as they appear).
//
// The API never decides who may do what. It passes the caller's own Keston ID
// access token on to each service, which checks it and applies its own
// rules, exactly as if the caller had gone to it directly. Cookies and
// browser headers are never passed on.
package upstream

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"
)

// Service is one service behind the API.
type Service struct {
	Name string
	URL  *url.URL

	client *http.Client
	proxy  *httputil.ReverseProxy
}

// Registry is every service behind the API, by name.
type Registry struct{ services map[string]*Service }

// Parse reads "id=http://keston-id:4444,work=http://work:3000".
func Parse(spec string) (*Registry, error) {
	transport := &http.Transport{
		DialContext:           (&net.Dialer{Timeout: 3 * time.Second}).DialContext,
		ResponseHeaderTimeout: 30 * time.Second,
		MaxIdleConnsPerHost:   16,
		IdleConnTimeout:       60 * time.Second,
	}
	reg := &Registry{services: map[string]*Service{}}
	for _, part := range strings.Split(spec, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		name, raw, ok := strings.Cut(part, "=")
		u, err := url.Parse(strings.TrimRight(raw, "/"))
		if !ok || name == "" || err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
			return nil, fmt.Errorf("services: %q should look like name=https://host", part)
		}
		s := &Service{Name: name, URL: u, client: &http.Client{Transport: transport, Timeout: 60 * time.Second}}
		s.proxy = &httputil.ReverseProxy{
			Transport: transport,
			Rewrite: func(r *httputil.ProxyRequest) {
				r.SetURL(u)
				r.SetXForwarded()
				// Only the token goes on: no cookies, and nothing that makes
				// the service treat this as a browser on another site.
				for _, h := range []string{"Cookie", "Origin", "Referer"} {
					r.Out.Header.Del(h)
				}
			},
			ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
				WriteError(w, http.StatusBadGateway, "service_unavailable",
					"Keston "+strings.ToUpper(name[:1])+name[1:]+" isn't answering. Try again in a moment.")
			},
		}
		reg.services[name] = s
	}
	if reg.services["id"] == nil {
		return nil, errors.New(`services: "id" (Keston ID) is required`)
	}
	return reg, nil
}

func (r *Registry) Get(name string) *Service { return r.services[name] }

// Proxy passes a request on as it is, and the answer back.
func (s *Service) Proxy() http.Handler { return s.proxy }

// Response is a service's answer to Do.
type Response struct {
	Status int
	Body   json.RawMessage
}

// OK: a 2xx answer.
func (r Response) OK() bool { return r.Status >= 200 && r.Status < 300 }

// Do calls the service as the caller (their token), sending in as JSON.
// A non-2xx answer isn't an error here: it's the service's say, in Response.
func (s *Service) Do(ctx context.Context, method, path, token, requestID string, in any) (Response, error) {
	var body io.Reader
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return Response{}, err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(s.URL.String(), "/")+path, body)
	if err != nil {
		return Response{}, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	if requestID != "" {
		req.Header.Set("X-Request-Id", requestID)
	}
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := s.client.Do(req)
	if err != nil {
		return Response{}, err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if err != nil {
		return Response{}, err
	}
	return Response{Status: res.StatusCode, Body: raw}, nil
}

// Ready: the service answers its /readyz.
func (s *Service) Ready(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.URL.String()+"/readyz", nil)
	if err != nil {
		return err
	}
	res, err := s.client.Do(req)
	if err != nil {
		return err
	}
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: /readyz gave %d", s.Name, res.StatusCode)
	}
	return nil
}

// WriteError sends an error in the format every Keston API uses
// ({"error", "message"}), the same as Keston ID's.
func WriteError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": code, "message": message})
}
