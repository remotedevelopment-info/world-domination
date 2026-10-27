package game

import "testing"

func TestComputeEconomyDirections(t *testing.T) {
	base := ComputeEconomy(1000, 500, 100, 50, 0, 0)

	// Raising the rate from a low level: more revenue but lower GDP (laffer).
	lowTax := ComputeEconomy(1000, 500, 100, 10, 0, 0)
	midTax := ComputeEconomy(1000, 500, 100, 60, 0, 0)
	if midTax.TaxRevenue <= lowTax.TaxRevenue {
		t.Errorf("expected higher revenue at 60%% than 10%% (got %d vs %d)", midTax.TaxRevenue, lowTax.TaxRevenue)
	}
	if midTax.GDP >= lowTax.GDP {
		t.Errorf("expected lower GDP at 60%% than 10%% (got %d vs %d)", midTax.GDP, lowTax.GDP)
	}

	// Confiscatory taxes raise less revenue than a moderate rate.
	confiscatory := ComputeEconomy(1000, 500, 100, 95, 0, 0)
	if confiscatory.TaxRevenue >= midTax.TaxRevenue {
		t.Errorf("expected laffer peak: revenue at 95%% (%d) below 60%% (%d)", confiscatory.TaxRevenue, midTax.TaxRevenue)
	}

	// More troops: larger military expenditure and a weaker balance.
	militarised := ComputeEconomy(1000, 500, 500, 50, 0, 0)
	if militarised.MilitaryExpenditure <= base.MilitaryExpenditure {
		t.Errorf("expected higher military expenditure with more troops")
	}
	if militarised.BudgetBalance >= base.BudgetBalance {
		t.Errorf("expected lower budget balance with more troops")
	}

	// Larger gold reserve: stronger currency.
	rich := ComputeEconomy(1000, 5000, 100, 50, 0, 0)
	if rich.CurrencyValue <= base.CurrencyValue {
		t.Errorf("expected stronger currency with larger reserve (%f vs %f)", rich.CurrencyValue, base.CurrencyValue)
	}

	// Development compounds GDP.
	developed := ComputeEconomy(1000, 500, 100, 50, 3, 2)
	if developed.GDP <= base.GDP {
		t.Errorf("expected higher GDP with markets/infrastructure (got %d vs %d)", developed.GDP, base.GDP)
	}

	// Surplus strengthens the currency relative to a deficit.
	surplus := ComputeEconomy(1000, 500, 0, 50, 0, 0)
	deficit := ComputeEconomy(1000, 500, 100000, 10, 0, 0)
	if surplus.CurrencyValue <= deficit.CurrencyValue {
		t.Errorf("expected surplus currency (%f) above deficit currency (%f)", surplus.CurrencyValue, deficit.CurrencyValue)
	}
	if surplus.BudgetBalance <= 0 {
		t.Errorf("expected positive balance with no troops (got %d)", surplus.BudgetBalance)
	}
	if deficit.BudgetBalance >= 0 {
		t.Errorf("expected negative balance with a huge army (got %d)", deficit.BudgetBalance)
	}
}

func TestPopulationGrowth(t *testing.T) {
	if g := PopulationGrowth(0, 50, 0, 0); g != 0 {
		t.Errorf("expected no growth for empty kingdom, got %d", g)
	}
	low := PopulationGrowth(1000, 10, 0, 0)
	high := PopulationGrowth(1000, 90, 0, 0)
	if low <= high {
		t.Errorf("expected higher growth under low taxes (got %d vs %d)", low, high)
	}
	developed := PopulationGrowth(1000, 50, 4, 4)
	base := PopulationGrowth(1000, 50, 0, 0)
	if developed <= base {
		t.Errorf("expected higher growth with development (got %d vs %d)", developed, base)
	}
}
