package game

import (
	"testing"
)

func TestHistoricalEras(t *testing.T) {
	cases := []struct {
		year int64
		era  string
	}{
		{1499, "discovery"},
		{1500, "discovery"},
		{1749, "discovery"},
		{1750, "revolt"},
		{1859, "revolt"},
		{1860, "independence"},
		{1919, "independence"},
		{1920, "decolonisation"},
		{1988, "decolonisation"},
		{1989, "modern"},
		{2026, "modern"},
	}

	for _, c := range cases {
		era := GetEraForYear(c.year)
		if era.ID != c.era {
			t.Errorf("GetEraForYear(%d) = %s, expected %s", c.year, era.ID, c.era)
		}
	}
}

func TestNormalizeChronoScale(t *testing.T) {
	validScales := []string{"1s", "5s", "1m", "1h", "4h", "1d", "2d", "4d"}
	for _, s := range validScales {
		if got := NormalizeChronoScale(s); got != s {
			t.Errorf("NormalizeChronoScale(%s) = %s, expected %s", s, got, s)
		}
	}

	if got := NormalizeChronoScale("invalid"); got != "1d" {
		t.Errorf("NormalizeChronoScale(invalid) = %s, expected 1d", got)
	}
}

func TestTimelineMutations(t *testing.T) {
	engine := GetEngine()
	engine.Start()

	// Jump to 1860 (Age of Independence)
	state := engine.SetSimYear(1860)
	if state.YearInt != 1860 {
		t.Fatalf("Expected YearInt 1860, got %d", state.YearInt)
	}
	if state.EraID != "independence" {
		t.Fatalf("Expected EraID independence, got %s", state.EraID)
	}

	// Change Chrono Scale to 5s
	state = engine.SetChronoScale("5s")
	if state.ChronoScale != "5s" {
		t.Fatalf("Expected ChronoScale 5s, got %s", state.ChronoScale)
	}

	// Pause Timeline
	state = engine.SetTimelinePaused(true)
	if !state.IsPaused {
		t.Fatalf("Expected IsPaused true, got false")
	}

	// Unpause
	state = engine.SetTimelinePaused(false)
	if state.IsPaused {
		t.Fatalf("Expected IsPaused false, got true")
	}

	// Advance to year 1920, scale 1s, paused
	engine.SetSimYear(1920)
	engine.SetChronoScale("1s")
	engine.SetTimelinePaused(true)

	// Execute full reset to Year 1500 base date
	resetState, err := engine.ResetToYear1500(true)
	if err != nil {
		t.Fatalf("ResetToYear1500 failed: %v", err)
	}
	if resetState.SimYear != 1500.0 {
		t.Fatalf("Expected SimYear 1500.0 after reset, got %f", resetState.SimYear)
	}
	if resetState.EraID != "discovery" {
		t.Fatalf("Expected EraID discovery after reset, got %s", resetState.EraID)
	}
	if resetState.ChronoScale != "1d" {
		t.Fatalf("Expected ChronoScale 1d after reset, got %s", resetState.ChronoScale)
	}
	if resetState.IsPaused {
		t.Fatalf("Expected IsPaused false after reset, got true")
	}

	for _, c := range resetState.Countries {
		if c.Troops != 0 || c.TroopsLevy != 0 || c.TroopsRegular != 0 || c.TroopsElite != 0 {
			t.Errorf("Expected 0 troops for %s, got total=%d levy=%d reg=%d elite=%d", c.Code, c.Troops, c.TroopsLevy, c.TroopsRegular, c.TroopsElite)
		}
		if c.FortN != 0 || c.FortS != 0 || c.FortE != 0 || c.FortW != 0 {
			t.Errorf("Expected 0 forts for %s, got N=%d S=%d E=%d W=%d", c.Code, c.FortN, c.FortS, c.FortE, c.FortW)
		}
		if c.MilitaryDelayedCosts != 0 {
			t.Errorf("Expected 0 military delayed costs for %s, got %d", c.Code, c.MilitaryDelayedCosts)
		}
	}
}

