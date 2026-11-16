// Package config reads Keston Admin's settings from environment variables.
package config

import (
	"fmt"
	"os"
)

type Config struct {
	// Where to listen.
	Addr string
	// The services behind the API, "name=url" separated by commas. "id" is
	// required (Keston ID). Add each new Keston app here as it appears.
	Services string
	// Keston ID's public address, for the web app to sign in with. Blank: the
	// app works it out from its own address (admin.keston.co → id.keston.co).
	IDURL string
	// The built web app.
	WebDir string
}

func Load() (*Config, error) {
	c := &Config{
		Addr:     env("KESTON_ADMIN_ADDR", ":8080"),
		Services: env("KESTON_API_SERVICES", "id=http://keston-id:8080"),
		IDURL:    os.Getenv("KESTON_ID_URL"),
		WebDir:   env("KESTON_ADMIN_WEB_DIR", "/srv"),
	}
	if c.Addr == "" {
		return nil, fmt.Errorf("KESTON_ADMIN_ADDR is empty")
	}
	return c, nil
}

func env(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}
