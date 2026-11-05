package game

import "testing"

func TestComputeEconomyDirections(t *testing.T) {

base := ComputeEconomy(1000, 500, 100, 50, 0, 0, 0, 0)
	// Raising the rate from a low level: more revenue but lower GDP (laffer).

lowTax := ComputeEconomy(1000, 500, 100, 10, 0, 0, 0, 0)
midTax := ComputeEconomy(1000, 500, 100, 60, 0, 0, 0, 0)
if midTax.TaxRevenue <= lowTax.TaxRevenue {
	
t.Errorf("expected higher revenue at 60%% than 10%% (got %d vs %d)", midTax.TaxRevenue, lowTax.TaxRevenue)
	}

if midTax.GDP >= lowTax.GDP {
	
t.Errorf("expected lower GDP at 60%% than 10%% (got %d vs %d)", midTax.GDP, lowTax.GDP)
	}

	// Confiscatory taxes raise less revenue than a moderate rate.

confiscatory := ComputeEconomy(1000, 500, 100, 95, 0, 0, 0, 0)
if confiscatory.TaxRevenue >= midTax.TaxRevenue {
	
t.Errorf("expected laffer peak: revenue at 95%% (%d) below 60%% (%d)", confiscatory.TaxRevenue, midTax.TaxRevenue)
	}

	// More troops: larger military expenditure and a weaker balance.

militarised := ComputeEconomy(1000, 500, 500, 50, 0, 0, 0, 0)
if militarised.MilitaryExpenditure <= base.MilitaryExpenditure {
	
t.Errorf("expected higher military expenditure with more troops")
	}

if militarised.BudgetBalance >= base.BudgetBalance {
	
t.Errorf("expected lower budget balance with more troops")
	}

	// Larger gold reserve: stronger currency.

rich := ComputeEconomy(1000, 5000, 100, 50, 0, 0, 0, 0)
if rich.CurrencyValue <= base.CurrencyValue {
	
t.Errorf("expected stronger currency with larger reserve (%f vs %f)", rich.CurrencyValue, base.CurrencyValue)
	}

	// Development compounds GDP.
	developed := ComputeEconomy(1000, 500, 100, 50, 3, 2, 0, 0)
	if developed.GDP <= base.GDP {
		t.Errorf("expected higher GDP with markets/infrastructure (got %d vs %d)", developed.GDP, base.GDP)
	}

	// Surplus strengthens the currency relative to a deficit.
	surplus := ComputeEconomy(1000, 500, 0, 50, 0, 0, 0, 0)
	deficit := ComputeEconomy(1000, 500, 100000, 10, 0, 0, 0, 0)
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
	if g := PopulationGrowth(0, 50, 0, 0, 0, 0); g != 0 {
		t.Errorf("expected no growth for empty kingdom, got %d", g)
	}

	low := PopulationGrowth(1000, 10, 0, 0, 0, 0)
	high := PopulationGrowth(1000, 90, 0, 0, 0, 0)
	if low <= high {
		t.Errorf("expected higher growth under low taxes (got %d vs %d)", low, high)
	}

	developed := PopulationGrowth(1000, 50, 4, 4, 0, 0)
	base := PopulationGrowth(1000, 50, 0, 0, 0, 0)
	if developed <= base {
		t.Errorf("expected higher growth with development (got %d vs %d)", developed, base)
	}
}

func TestTroopsReduceTaxRevenueAndTreasury(t *testing.T) {
	civilian := ComputeEconomy(10000, 5000, 0, 50, 2, 2, 0, 0)
	militarised := ComputeEconomy(10000, 5000, 2000, 50, 2, 2, 0, 0)

	// Recruiting troops pulls civilians into the military, reducing productive GDP and taxation income
	if militarised.TaxRevenue >= civilian.TaxRevenue {
		t.Errorf("expected recruiting troops to reduce taxation income (got %d vs %d)",
			militarised.TaxRevenue, civilian.TaxRevenue)
	}

	// Troop upkeep increases military expenditure, draining the budget balance
	if militarised.MilitaryExpenditure <= civilian.MilitaryExpenditure {
		t.Errorf("expected higher military expenditure with standing troops")
	}

	if militarised.BudgetBalance >= civilian.BudgetBalance {
		t.Errorf("expected military troops to lower budget balance (got %d vs %d)",
			militarised.BudgetBalance, civilian.BudgetBalance)
	}
}

func TestMarketIncomeAndRisk(t *testing.T) {
	// Zero markets produce zero income and zero risk
	base0, risk0 := MarketIncomeAndRisk(0, 1500, 1)
	if base0 != 0 || risk0 != 0 {
		t.Errorf("expected 0 income/risk with 0 markets, got base=%f, risk=%f", base0, risk0)
	}

	// Active markets produce positive base revenue
	base1, risk1 := MarketIncomeAndRisk(2, 1500, 1)
	if base1 <= 0 {
		t.Errorf("expected positive market base income, got %f", base1)
	}

	// Higher tier markets produce proportionally higher base income
	base2, _ := MarketIncomeAndRisk(4, 1500, 1)
	if base2 != base1*2 {
		t.Errorf("expected linear market base scaling (got %f vs %f)", base2, base1*2)
	}

	// Risk swing oscillates across simulation years (demonstrating market volatility)
	_, riskYear1 := MarketIncomeAndRisk(2, 1500.0, 1)
	_, riskYear2 := MarketIncomeAndRisk(2, 1500.5, 1)
	if riskYear1 == riskYear2 {
		t.Errorf("expected market risk volatility across different simulation phases")
	}
	_ = risk1
}
