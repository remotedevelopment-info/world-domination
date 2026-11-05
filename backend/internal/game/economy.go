package game

import "math"

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
	InflationRate       float64 `json:"inflation_rate"`
	Investment          int64   `json:"investment"`
	SocialCosts         int64   `json:"social_costs"`
	Markets             int64   `json:"markets"`
	Infrastructure      int64   `json:"infrastructure"`
}

const (
	// baseProductivity is gold output per capita per cycle before modifiers.
	baseProductivity = 0.02
	// carryingCapacity is the population level beyond which growth collapses
	// (logistic damping). Without it, per-capita growth is proportional to
	// population, which blows up the treasury in days.
	carryingCapacity = 1000000
	// troopUpkeep is the gold cost per troop per cycle.
	troopUpkeep = 0.5
	// marketBoost / infraBoost compound GDP per build level.
	marketBoost = 0.05
	infraBoost  = 0.03
	// currencyBackingRatio is the reserve-to-GDP ratio priced as 1.00 gold.
	currencyBackingRatio = 5.0
	// investmentBoost compounds GDP per investment level (0-100).
	investmentBoost = 0.002
	// socialSpendPerUnit is the immediate budget cost of one social_costs point.
	socialSpendPerUnit = 0.20
	// inflation coefficients: currency pressure per unit of deficit, social
	// spending, and investment. Kept small so the indicator reads in the
	// single-digit-to-low-double-digit percent range for typical sliders.
	inflationDrift = 0.05
	inflationSocial = 0.02
	inflationInvestment = 0.005
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
// Productive civilian workforce: troops in barracks and standing armies do not
// produce civilian agricultural or commercial output, so expanding the military
// directly reduces GDP and taxation revenue.
func gdpValue(population, troops, taxRate, markets, infrastructure int64) float64 {
	workforce := population - troops
	if workforce < 0 {
		workforce = 0
	}
	return float64(workforce) * baseProductivity * laffer(taxRate) *
		(1 + marketBoost*float64(markets)) * (1 + infraBoost*float64(infrastructure))
}

// ComputeEconomy derives all dashboard indicators from persisted state.
// Revenue, expenditure and balance are per 90-second cycle.
func ComputeEconomy(population, resources, troops, taxRate, markets, infrastructure, investment, socialCosts int64) EconomyState {
	gdp := gdpValue(population, troops, taxRate, markets, infrastructure)
	// Investment compounds GDP in future periods (a perennial productivity lever).
	gdp *= 1.0 + investmentBoost*float64(investment)
	revenue := int64(gdp*float64(taxRate)/100.0 + 0.5)
	expenditure := int64(float64(troops)*troopUpkeep + 0.5)
	// Social costs and investment are deliberate spend: they buy future growth
	// or welfare now, drawing down the budget balance.
	socialSpend := int64(float64(socialCosts) * socialSpendPerUnit)
	investmentSpend := int64(float64(investment) * socialSpendPerUnit)
	expenditure += socialSpend + investmentSpend
	balance := revenue - expenditure

	// The currency is gold-backed: its value tracks the reserve-to-GDP
	// ratio, nudged up or down by the budget trajectory.
	value := 1.0
	if gdp > 0 {
		value = (float64(resources) / gdp) / currencyBackingRatio
	}
	// Inflation is the forward-looking currency pressure: a persistent deficit
	// and above-target social spending dilute the gold-backed ledger.
	inflation := 0.0
	if balance < 0 {
		inflation = -float64(balance) * inflationDrift
	}
	// Social spending adds monetary pressure proportionally.
	inflation += float64(socialCosts) * inflationSocial
	// Investment adds mild dilution while the gilt is being built.
	inflation += float64(investment) * inflationInvestment
	if inflation < 0 {
		inflation = 0
	}
	if inflation > 100 {
		inflation = 100
	}

	return EconomyState{
		TaxRate:             taxRate,
		GDP:                 int64(gdp + 0.5),
		TaxRevenue:          revenue,
		MilitaryExpenditure: expenditure,
		BudgetBalance:       balance,
		GoldReserve:         resources,
		CurrencyValue:       value,
		InflationRate:       inflation,
		Investment:          investment,
		SocialCosts:         socialCosts,
		Markets:             markets,
		Infrastructure:      infrastructure,
	}
}

// PopulationGrowth returns the population change for one 90-second cycle:
// prosperity (output per capita) and infrastructure drive growth, while
// punitive taxes depress it via the laffer factor inside gdpValue. Investment
// and social spending accrue into future output/capacity. Growth is damped
// logistically so population — and therefore the treasury — cannot explode.
func PopulationGrowth(population, taxRate, markets, infrastructure, investment, socialCosts int64) int64 {
	if population <= 0 {
		return 0
	}
	if population >= carryingCapacity {
		return 0
	}
	perCapita := gdpValue(population, 0, taxRate, markets, infrastructure) / float64(population)
	growth := float64(population) * 0.005 * (perCapita / baseProductivity)
	growth += float64(investment+socialCosts) * 0.0005
	// Logistic damping: the closer the kingdom is to its carrying capacity, the
	// slower it grows. Without this the growth term is proportional to the
	// population itself, and budget balances grow unbounded.
	damped := growth * (1.0 - float64(population)/float64(carryingCapacity))
	if damped < 0 {
		damped = 0
	}
	g := int64(damped)
	if g < 1 {
		g = 1
	}
	return g
}

// MarketIncomeAndRisk returns the base commercial trade revenue and volatility risk swing
// for a kingdom with the given market level and current simYear.
// Markets generate substantial trade revenue, but introduce economic risk (piracy, trade slumps vs merchant booms).
func MarketIncomeAndRisk(markets int64, simYear float64, countryID int64) (baseIncome float64, riskSwing float64) {
	if markets <= 0 {
		return 0, 0
	}
	// Commercial tariff and merchant guild income per market level
	baseIncome = float64(markets) * 12.0

	// Market risk volatility wave: sinusoidal variation across time and country geography
	cycle := math.Sin(float64(countryID)*1.618 + simYear*2.0*math.Pi)
	// Swings between -50% (trade disruption / piracy / market slump) to +70% (merchant windfalls)
	riskSwing = baseIncome * (0.10 + 0.60*cycle)
	return baseIncome, riskSwing
}
