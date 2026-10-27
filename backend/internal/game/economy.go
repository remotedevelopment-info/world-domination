package game

// EconomyState is the derived economic dashboard for one country. It is
// recomputed from persisted state on every build, so clients always render
// current indicators without any extra persistence.
type EconomyState struct {
	TaxRate             int64   `json:"tax_rate"`
	GDP                 int64   `json:"gdp"`
	TaxRevenue          int64   `json:"tax_revenue"`
	MilitaryExpenditure int64   `json:"military_expenditure"`
	BudgetBalance       int64   `json:"budget_balance"`
	GoldReserve         int64   `json:"gold_reserve"`
	CurrencyValue       float64 `json:"currency_value"`
	Markets             int64   `json:"markets"`
	Infrastructure      int64   `json:"infrastructure"`
}

const (
	// baseProductivity is gold output per capita per cycle before modifiers.
	baseProductivity = 0.02
	// troopUpkeep is the gold cost per troop per cycle.
	troopUpkeep = 0.5
	// marketBoost / infraBoost compound GDP per build level.
	marketBoost = 0.05
	infraBoost  = 0.03
	// currencyBackingRatio is the reserve-to-GDP ratio priced as 1.00 gold.
	currencyBackingRatio = 5.0
)

// laffer models tax drag on output: productivity is full at a 0% rate and
// falls quadratically toward a floor as the rate approaches 100%. Combined
// with revenue = output x rate, this puts the revenue-maximising rate near
// 58%, giving the dial a genuine trade-off.
func laffer(rate int64) float64 {
	r := float64(rate) / 100.0
	f := 1.0 - r*r
	if f < 0.1 {
		f = 0.1
	}
	return f
}

// gdpValue computes gross domestic product per 90-second cycle.
func gdpValue(population, taxRate, markets, infrastructure int64) float64 {
	return float64(population) * baseProductivity * laffer(taxRate) *
		(1 + marketBoost*float64(markets)) * (1 + infraBoost*float64(infrastructure))
}

// ComputeEconomy derives all dashboard indicators from persisted state.
// Revenue, expenditure and balance are per 90-second cycle.
func ComputeEconomy(population, resources, troops, taxRate, markets, infrastructure int64) EconomyState {
	gdp := gdpValue(population, taxRate, markets, infrastructure)
	revenue := int64(gdp*float64(taxRate)/100.0 + 0.5)
	expenditure := int64(float64(troops)*troopUpkeep + 0.5)
	balance := revenue - expenditure

	// The currency is gold-backed: its value tracks the reserve-to-GDP
	// ratio, nudged up or down by the budget trajectory.
	value := 1.0
	if gdp > 0 {
		value = (float64(resources) / gdp) / currencyBackingRatio
	}
	if balance > 0 {
		value *= 1.05
	} else if balance < 0 {
		value *= 0.95
	}
	if value < 0.10 {
		value = 0.10
	}
	if value > 10.0 {
		value = 10.0
	}

	return EconomyState{
		TaxRate:             taxRate,
		GDP:                 int64(gdp + 0.5),
		TaxRevenue:          revenue,
		MilitaryExpenditure: expenditure,
		BudgetBalance:       balance,
		GoldReserve:         resources,
		CurrencyValue:       value,
		Markets:             markets,
		Infrastructure:      infrastructure,
	}
}

// PopulationGrowth returns the population change for one 90-second cycle:
// prosperity (output per capita) and infrastructure drive growth, while
// punitive taxes depress it via the laffer factor inside gdpValue.
func PopulationGrowth(population, taxRate, markets, infrastructure int64) int64 {
	if population <= 0 {
		return 0
	}
	perCapita := gdpValue(population, taxRate, markets, infrastructure) / float64(population)
	growth := float64(population) * 0.005 * (perCapita / baseProductivity)
	g := int64(growth)
	if g < 1 {
		g = 1
	}
	return g
}
