package game

import (
	"strings"
)

// Era represents a historical epoch with boundary start and end years.
type Era struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	StartYear int64  `json:"start_year"`
	EndYear   int64  `json:"end_year"`
}

// HistoricalEras represents the canonical eras matching the frontend chronometer.
var HistoricalEras = []Era{
	{ID: "discovery", Name: "THE AGE OF DISCOVERY", StartYear: 1500, EndYear: 1749},
	{ID: "revolt", Name: "THE AGE OF REVOLT", StartYear: 1750, EndYear: 1859},
	{ID: "independence", Name: "THE AGE OF INDEPENDENCE", StartYear: 1860, EndYear: 1919},
	{ID: "decolonisation", Name: "AGE OF DECOLONISATION", StartYear: 1920, EndYear: 1988},
	{ID: "modern", Name: "THE MODERN AGE", StartYear: 1989, EndYear: 9999},
}

// ChronoScales maps scale keys to real seconds required to advance 1 game year.
var ChronoScales = map[string]float64{
	"1s": 1.0,
	"5s": 5.0,
	"1m": 60.0,
	"1h": 3600.0,
	"4h": 14400.0,
	"1d": 86400.0,
	"2d": 172800.0,
	"4d": 345600.0,
}

// GetEraForYear returns the Era corresponding to the specified integer year.
func GetEraForYear(year int64) Era {
	for _, era := range HistoricalEras {
		if year >= era.StartYear && year <= era.EndYear {
			return era
		}
	}
	if year < HistoricalEras[0].StartYear {
		return HistoricalEras[0]
	}
	return HistoricalEras[len(HistoricalEras)-1]
}

// NormalizeChronoScale validates and returns a standard scale key (default "1d").
func NormalizeChronoScale(scale string) string {
	scale = strings.TrimSpace(strings.ToLower(scale))
	if _, ok := ChronoScales[scale]; ok {
		return scale
	}
	return "1d"
}

