package game

import "math"

// EconomyState is the derived economic dashboard and annual budget ledger for one country.
// It is recomputed from persisted state on every build, so clients always render
// current indicators and Last Year vs. This Year budget comparisons.
type EconomyState struct {
	TaxRate             int64   `json:"tax_rate"`
	GDP                 int64   `json:"gdp"`
	TaxRevenue          int64   `json:"tax_revenue"`
	MarketRevenue       int64   `json:"market_revenue"`
	TotalRevenue        int64   `json:"total_revenue"`
	MilitaryUpkeep      int64   `json:"military_upkeep"`
	SocialExpenditure   int64   `json:"social_expenditure"`
	InvestmentExpenditure int64 `json:"investment_expenditure"`
	MilitaryExpenditure int64   `json:"military_expenditure"`
	TroopsLevy          int64   `json:"troops_levy"`
	TroopsRegular       int64   `json:"troops_regular"`
	TroopsElite         int64   `json:"troops_elite"`
	BudgetBalance       int64   `json:"budget_balance"`
	EffectiveMilitaryExp  int64 `json:"effective_military_exp"`
	EffectiveSocialExp    int64 `json:"effective_social_exp"`
	EffectiveInvestmentExp int64 `json:"effective_investment_exp"`
	EffectiveTotalExp     int64 `json:"effective_total_exp"`
	EffectiveBalance      int64 `json:"effective_balance"`
	DeficitCapped       bool    `json:"deficit_capped"`
	FiscalRegime        string  `json:"fiscal_regime"`
	GoldReserve         int64   `json:"gold_reserve"`
	CurrencyValue       float64 `json:"currency_value"`
	InflationRate       float64 `json:"inflation_rate"`
	Investment          int64   `json:"investment"`
	SocialCosts         int64   `json:"social_costs"`
	Markets             int64   `json:"markets"`
	Infrastructure      int64   `json:"infrastructure"`
	PopulationPressure  float64 `json:"population_pressure"`
	NetMigration        int64   `json:"net_migration"`
	// Last Year's Actual Ledger
	LastTaxRevenue      int64   `json:"last_tax_revenue"`
	LastMarketIncome    int64   `json:"last_market_income"`
	LastMilitaryExp     int64   `json:"last_military_exp"`
	LastSocialExp       int64   `json:"last_social_exp"`
	LastInvestmentExp   int64   `json:"last_investment_exp"`
	LastTotalExp        int64   `json:"last_total_exp"`
	LastBudgetBalance   int64   `json:"last_budget_balance"`
	LastMigration       int64   `json:"last_migration"`
}

const (
	// baseProductivity is gold output per capita per cycle before modifiers.
	baseProductivity = 0.02
	// carryingCapacity is the population level beyond which growth collapses
	// (logistic damping). Without it, per-capita growth is proportional to
	// population, which blows up the treasury in days.
	carryingCapacity = 1000000
	// troopUpkeep is the gold cost per troop per cycle for unstratified troops.
	troopUpkeep = 4.0
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

// EnforceBalancedBudget enforces the Layer 1 Hard-Specie Balanced Budget Rule (No Deficits).
// Total annual expenditure cannot exceed total annual revenue.
// Standing military upkeep has first claim on revenue; remaining revenue is allocated
// proportionally between social welfare and capital investment.
func EnforceBalancedBudget(totalRevenue, militaryUpkeep, socialSpend, investmentSpend int64) (effMil, effSoc, effInv int64, capped bool) {
	if totalRevenue < 0 {
		totalRevenue = 0
	}
	if militaryUpkeep < 0 {
		militaryUpkeep = 0
	}
	if socialSpend < 0 {
		socialSpend = 0
	}
	if investmentSpend < 0 {
		investmentSpend = 0
	}

	plannedTotal := militaryUpkeep + socialSpend + investmentSpend
	if plannedTotal <= totalRevenue {
		return militaryUpkeep, socialSpend, investmentSpend, false
	}

	// Spending exceeds revenue: cap outlays so the budget never runs a deficit.
	if militaryUpkeep >= totalRevenue {
		return totalRevenue, 0, 0, true
	}

	effMil = militaryUpkeep
	remaining := totalRevenue - militaryUpkeep
	discretionary := socialSpend + investmentSpend
	if discretionary > 0 {
		effSoc = int64(math.Round(float64(remaining) * float64(socialSpend) / float64(discretionary)))
		if effSoc > remaining {
			effSoc = remaining
		}
		effInv = remaining - effSoc
	}
	return effMil, effSoc, effInv, true
}

// ComputePopulationPressure returns a 0..100 index of demographic and mobilization strain.
// High population density relative to infrastructure or high military mobilization raises pressure,
// while infrastructure expansion and social welfare spending relieve it.
func ComputePopulationPressure(population, troops, infrastructure, socialCosts int64) float64 {
	if population <= 0 {
		return 0
	}
	effectiveCap := float64(carryingCapacity) * (0.20 + 0.15*float64(infrastructure))
	densityPressure := (float64(population) / effectiveCap) * 45.0
	mobilizationPressure := (float64(troops) / float64(population)) * 120.0
	socialRelief := float64(socialCosts) * 0.25

	pressure := densityPressure + mobilizationPressure - socialRelief
	if pressure < 0 {
		pressure = 0
	}
	if pressure > 100 {
		pressure = 100
	}
	return math.Round(pressure*10) / 10
}

// ComputeMigration returns the net annual population migration for a kingdom.
// Confiscatory taxation (> 60%) triggers tax flight (negative migration / emigration).
// Low taxation (<= 35%) paired with infrastructure and social welfare attracts immigrants.
func ComputeMigration(population, taxRate, socialCosts, infrastructure int64) int64 {
	if population <= 0 {
		return 0
	}
	if taxRate > 60 {
		excess := float64(taxRate - 60)
		relief := float64(socialCosts) * 0.12
		effExcess := excess - relief
		if effExcess <= 0 {
			return 0
		}
		// Quadratic tax flight up to ~3.5% of population per year at 100% tax
		rate := (effExcess / 40.0) * (effExcess / 40.0) * 0.035
		loss := int64(math.Ceil(float64(population) * rate))
		if loss < 1 {
			loss = 1
		}
		return -loss
	}
	if taxRate <= 35 && population < carryingCapacity {
		taxAdvantage := float64(36-taxRate) / 36.0
		civicFactor := 1.0 + float64(infrastructure)*0.20 + float64(socialCosts)*0.015
		damping := 1.0 - float64(population)/float64(carryingCapacity)
		rate := 0.002 * taxAdvantage * civicFactor * damping
		gain := int64(math.Round(float64(population) * rate))
		if gain < 1 && (infrastructure > 0 || socialCosts >= 20 || taxRate <= 25) {
			gain = 1
		}
		return gain
	}
	return 0
}

// ComputeEconomy derives all dashboard and annual budget indicators from persisted state.
func ComputeEconomy(population, resources, troops, taxRate, markets, infrastructure, investment, socialCosts int64) EconomyState {
	return ComputeEconomyWithLayers(population, resources, troops, taxRate, markets, infrastructure, investment, socialCosts, 0, troops, 0)
}

// ComputeEconomyWithLayers derives all economic, budget, and military ledger indicators
// incorporating tiered military units (levies, regulars, elites) and scaled civic/cathedral investments.
func ComputeEconomyWithLayers(
	population, resources, troops, taxRate, markets, infrastructure, investment, socialCosts int64,
	levy, regular, elite int64,
) EconomyState {
	gdp := gdpValue(population, troops, taxRate, markets, infrastructure)
	// Investment compounds GDP in future periods (a perennial productivity lever).
	gdp *= 1.0 + investmentBoost*float64(investment)
	revenue := int64(gdp*float64(taxRate)/100.0 + 0.5)
	marketRev := int64(markets * 12)
	totalRev := revenue + marketRev
	if totalRev < 0 {
		totalRev = 0
	}

	// Multi-tiered military upkeep:
	// Levy: 2.0 gold/troop (peasant militia, cheap upkeep)
	// Regular: 6.0 gold/troop (disciplined standing footmen, arms, armor)
	// Elite: 18.0 gold/troop (royal tercios, knightly retinues, high maintenance)
	var milUpkeep int64
	if (levy + regular + elite) > 0 {
		milUpkeep = int64(math.Round(float64(levy)*2.0 + float64(regular)*6.0 + float64(elite)*18.0))
	} else {
		milUpkeep = int64(float64(troops)*troopUpkeep + 0.5)
	}

	// Cathedral tithes, civic administration, and court justice:
	// Scales with realm GDP capacity, reflecting real fiscal burdens of monumental building and national institutions.
	socialSpend := int64(math.Round(float64(socialCosts)*2.0 + float64(gdp)*(float64(socialCosts)/100.0)*0.08))
	// Colonial expeditions, trading ventures, and infrastructure investment:
	investmentSpend := int64(math.Round(float64(investment)*2.0 + float64(gdp)*(float64(investment)/100.0)*0.08))
	expenditure := milUpkeep + socialSpend + investmentSpend
	balance := totalRev - expenditure

	// Enforce Layer 1 Hard-Specie Fiscal Rules:
	// As long as the kingdom has gold reserves in its treasury (resources > 0),
	// it can spend down its specie reserves to fund deficits.
	// Once the treasury is exhausted (resources <= 0), sovereign borrowing is unavailable
	// in Era 1, so outlays are strictly capped to annual revenue.
	var effMil, effSoc, effInv int64
	var capped bool
	fiscalRegime := "BALANCED_SPECIE"

	if resources > 0 {
		effMil = milUpkeep
		effSoc = socialSpend
		effInv = investmentSpend
		capped = false
		if balance < 0 {
			fiscalRegime = "DEFICIT_RESERVE_DRAIN"
		}
	} else {
		effMil, effSoc, effInv, capped = EnforceBalancedBudget(totalRev, milUpkeep, socialSpend, investmentSpend)
		if capped {
			fiscalRegime = "HARD_SPECIE_RATIONING"
		}
	}
	effTotalExp := effMil + effSoc + effInv
	effBalance := totalRev - effTotalExp

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

	popPressure := ComputePopulationPressure(population, troops, infrastructure, socialCosts)
	netMig := ComputeMigration(population, taxRate, socialCosts, infrastructure)

	return EconomyState{
		TaxRate:                taxRate,
		GDP:                    int64(gdp + 0.5),
		TaxRevenue:             revenue,
		MarketRevenue:          marketRev,
		TotalRevenue:           totalRev,
		MilitaryUpkeep:         milUpkeep,
		SocialExpenditure:      socialSpend,
		InvestmentExpenditure:  investmentSpend,
		MilitaryExpenditure:    expenditure,
		TroopsLevy:             levy,
		TroopsRegular:          regular,
		TroopsElite:            elite,
		BudgetBalance:          balance,
		EffectiveMilitaryExp:   effMil,
		EffectiveSocialExp:     effSoc,
		EffectiveInvestmentExp: effInv,
		EffectiveTotalExp:      effTotalExp,
		EffectiveBalance:       effBalance,
		DeficitCapped:          capped,
		FiscalRegime:           fiscalRegime,
		GoldReserve:            resources,
		CurrencyValue:          value,
		InflationRate:          inflation,
		Investment:             investment,
		SocialCosts:            socialCosts,
		Markets:                markets,
		Infrastructure:         infrastructure,
		PopulationPressure:     popPressure,
		NetMigration:           netMig,
	}
}

// PopulateLastYearLedger attaches persisted last-year budget actuals to an EconomyState,
// falling back to the current effective baseline if the country has not yet recorded a cycle.
func PopulateLastYearLedger(
	econ *EconomyState,
	lastTaxRev, lastMarketInc, lastMilExp, lastSocExp, lastInvExp, lastTotalExp, lastBalance, lastMig int64,
) {
	if econ == nil {
		return
	}
	if lastTaxRev == 0 && lastTotalExp == 0 && lastMarketInc == 0 {
		econ.LastTaxRevenue = econ.TaxRevenue
		econ.LastMarketIncome = econ.MarketRevenue
		econ.LastMilitaryExp = econ.EffectiveMilitaryExp
		econ.LastSocialExp = econ.EffectiveSocialExp
		econ.LastInvestmentExp = econ.EffectiveInvestmentExp
		econ.LastTotalExp = econ.EffectiveTotalExp
		econ.LastBudgetBalance = econ.EffectiveBalance
		econ.LastMigration = econ.NetMigration
		return
	}
	econ.LastTaxRevenue = lastTaxRev
	econ.LastMarketIncome = lastMarketInc
	econ.LastMilitaryExp = lastMilExp
	econ.LastSocialExp = lastSocExp
	econ.LastInvestmentExp = lastInvExp
	econ.LastTotalExp = lastTotalExp
	econ.LastBudgetBalance = lastBalance
	econ.LastMigration = lastMig
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
