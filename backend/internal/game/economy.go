package game

import (
	"fmt"
	"math"
)

// SeasonalClimaticState tracks astronomical, orbital, and historical Little Ice Age conditions.
type SeasonalClimaticState struct {
	Season             string  `json:"season"`               // "Spring", "Summer", "Autumn", "Winter"
	SeasonName         string  `json:"season_name"`          // e.g. "Autumn Harvest 1500"
	YearPhase          float64 `json:"year_phase"`           // 0.00 to 0.99
	MilankovitchFactor float64 `json:"milankovitch_factor"`  // Orbital drift variance (-0.05 to +0.05)
	LittleIceAgePhase  string  `json:"little_ice_age_phase"` // e.g. "Spörer Minimum", "Maunder Minimum", "Temperate"
	HarvestYieldFactor float64 `json:"harvest_yield_factor"` // Multiplier on agricultural output (0.80 - 1.25)
	WinterSeverity     float64 `json:"winter_severity"`      // Winter logistics and military upkeep modifier (1.0 - 1.45)
	CommercialVelocity float64 `json:"commercial_velocity"`  // Trade season velocity (0.85 - 1.25)
}

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

	// Demographic & Wealth Factor Telemetry
	WealthFactor        float64 `json:"wealth_factor"`
	WealthyRatio        float64 `json:"wealthy_ratio"`
	WealthyMigration    int64   `json:"wealthy_migration"`
	GeneralMigration    int64   `json:"general_migration"`
	CapitalFlightDrain  int64   `json:"capital_flight_drain"`
	MigrationStatus     string  `json:"migration_status"`

	// Feature/Internals: User State & Environmental Telemetry
	EntrepreneurialPride    float64 `json:"entrepreneurial_pride"`
	MilitaryDelayedCosts    int64   `json:"military_delayed_costs"`
	SeasonalHarvestFactor   float64 `json:"seasonal_harvest_factor"`
	WinterSeverityFactor    float64 `json:"winter_severity_factor"`
	ManpowerRecruitDiscount float64 `json:"manpower_recruit_discount"`
	WelfareSqualorBurden    int64   `json:"welfare_squalor_burden"`
	Season                  string  `json:"season"`
	SeasonName              string  `json:"season_name"`
	LittleIceAgePhase       string  `json:"little_ice_age_phase"`

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

// GetClimaticAndSeasonalState derives astronomical, orbital, and Little Ice Age climatic modifiers.
func GetClimaticAndSeasonalState(simYear float64) SeasonalClimaticState {
	yearInt := int64(math.Floor(simYear))
	phase := simYear - float64(yearInt)
	if phase < 0 {
		phase = 0
	}
	if phase >= 1.0 {
		phase = 0.999
	}

	var season string
	var commVelocity, harvestFactor, winterSeverity float64

	switch {
	case phase < 0.25:
		season = "Spring"
		commVelocity = 1.05
		harvestFactor = 1.00
		winterSeverity = 1.00
	case phase < 0.50:
		season = "Summer"
		commVelocity = 1.20
		harvestFactor = 1.05
		winterSeverity = 1.00
	case phase < 0.75:
		season = "Autumn"
		commVelocity = 1.10
		harvestFactor = 1.18 // Harvest bounty
		winterSeverity = 1.05
	default:
		season = "Winter"
		commVelocity = 0.85 // Sea freezing, mountain passes closed
		harvestFactor = 0.90
		winterSeverity = 1.25 // Heavy logistics and winter upkeep
	}

	// Historical Little Ice Age & Solar Minimums (1500-1850)
	var liaPhase string
	switch {
	case yearInt >= 1645 && yearInt <= 1715:
		liaPhase = "Maunder Minimum (Severe Little Ice Age Cold)"
		winterSeverity += 0.20
		harvestFactor -= 0.12
	case yearInt >= 1480 && yearInt <= 1550:
		liaPhase = "Spörer Minimum (Little Ice Age Cold)"
		winterSeverity += 0.12
		harvestFactor -= 0.08
	case yearInt >= 1790 && yearInt <= 1830:
		liaPhase = "Dalton Minimum (Volcanic Perturbation)"
		winterSeverity += 0.10
		harvestFactor -= 0.10
	case yearInt < 1860:
		liaPhase = "Little Ice Age (Cool)"
		winterSeverity += 0.05
	default:
		liaPhase = "Temperate Modern Epoch"
	}

	// Milankovitch orbital eccentricity oscillation (quasi-periodic astronomical drift)
	milan := 0.035 * math.Sin(float64(yearInt)*2.0*math.Pi/41.0) * math.Cos(float64(yearInt)*2.0*math.Pi/93.0)
	harvestFactor += milan
	harvestFactor = math.Round(harvestFactor*100) / 100
	winterSeverity = math.Round(winterSeverity*100) / 100

	seasonName := fmt.Sprintf("%s %d", season, yearInt)
	if season == "Autumn" {
		seasonName = fmt.Sprintf("Autumn Harvest %d", yearInt)
	}

	return SeasonalClimaticState{
		Season:             season,
		SeasonName:         seasonName,
		YearPhase:          math.Round(phase*100) / 100,
		MilankovitchFactor: math.Round(milan*1000) / 1000,
		LittleIceAgePhase:  liaPhase,
		HarvestYieldFactor: harvestFactor,
		WinterSeverity:     winterSeverity,
		CommercialVelocity: commVelocity,
	}
}

// ComputeWealthFactor returns:
// 1. wealthFactor (0.05 to 1.00): composite wealth score based on productivity, markets, infrastructure, and solvency
// 2. wealthyRatio (0.02 to 0.18): proportion of population in the wealthy/merchant class
func ComputeWealthFactor(population, resources, gdp, markets, infrastructure int64, pride float64) (wealthFactor float64, wealthyRatio float64) {
	if population <= 0 {
		return 0.10, 0.02
	}
	gdpPerCap := float64(gdp) / float64(population)
	gdpScore := math.Min(2.5, gdpPerCap/baseProductivity)
	commScore := 1.0 + float64(markets)*0.20 + float64(infrastructure)*0.10
	resPerCap := float64(resources) / float64(population)
	solvencyScore := math.Min(2.0, 0.5+resPerCap*1000.0)
	prideScore := 0.60 + 0.40*(pride/100.0)

	composite := (gdpScore*0.35 + commScore*0.35 + solvencyScore*0.15) * (prideScore*0.15 + 0.85)
	wealthFactor = math.Max(0.0, math.Min(1.0, (composite-0.50)/2.0))
	wealthFactor = math.Round(wealthFactor*1000) / 1000

	// Percentage of wealthy varies from 2.0% in agrarian economies up to 18.0% in advanced merchant hubs
	wealthyRatio = 0.02 + wealthFactor*0.16
	wealthyRatio = math.Round(wealthyRatio*1000) / 1000
	return wealthFactor, wealthyRatio
}

// MigrationBreakdown encapsulates threshold-based segmented demographic migration.
type MigrationBreakdown struct {
	NetMigration       int64   `json:"net_migration"`
	WealthyMigration   int64   `json:"wealthy_migration"`
	GeneralMigration   int64   `json:"general_migration"`
	WealthFactor       float64 `json:"wealth_factor"`
	WealthyRatio       float64 `json:"wealthy_ratio"`
	CapitalFlightDrain int64   `json:"capital_flight_drain"`
	MigrationStatus    string  `json:"migration_status"`
}

// ComputeMigrationDetailed computes segmented migration across thresholds for wealthy and general populations:
// - Low Tax Haven (<= 20%): Wealthy merchants from other realms view this territory as an attractive tax haven to relocate to.
// - Fair / Balanced Taxation (21% - 35%): Encourages steady artisan/family immigration and demographic expansion.
// - Moderate / Normal Taxation (36% - 58%): Balanced baseline.
// - High Taxation (59% - 68%): Moderate drag on general populace and marginal merchants.
// - Extreme Taxation (> 68%): Confiscatory! The wealthy look at other countries and actively migrate away first (capital flight).
func ComputeMigrationDetailed(population, resources, gdp, taxRate, markets, infrastructure, socialCosts int64, pride float64) MigrationBreakdown {
	if population <= 0 {
		return MigrationBreakdown{}
	}

	wealthFactor, wealthyRatio := ComputeWealthFactor(population, resources, gdp, markets, infrastructure, pride)
	wealthyPop := int64(math.Round(float64(population) * wealthyRatio))
	generalPop := population - wealthyPop
	if generalPop < 0 {
		generalPop = 0
	}

	var wealthyMig int64
	var generalMig int64
	var capitalDrain int64
	var status string

	switch {
	// Threshold 1: Low Tax Haven (taxRate <= 20%)
	case taxRate <= 20:
		status = "CAPITAL_HAVEN"
		shelterPull := float64(21-taxRate) / 20.0
		commPull := 1.0 + float64(markets)*0.25 + float64(infrastructure)*0.15
		prideBonus := 0.70 + 0.30*(pride/100.0)
		wRate := 0.015 * shelterPull * commPull * prideBonus
		wealthyMig = int64(math.Round(float64(wealthyPop) * wRate))
		if wealthyMig < 1 && taxRate <= 15 && wealthyPop > 10 {
			wealthyMig = 1
		}

		gRate := 0.003 * shelterPull * (1.0 + float64(infrastructure)*0.20 + float64(socialCosts)*0.005)
		generalMig = int64(math.Round(float64(generalPop) * gRate))
		capitalDrain = wealthyMig * 5 // Capital injection (+gold into treasury)

	// Threshold 2: Fair / Balanced Level of Taxation (21% <= taxRate <= 35%)
	case taxRate <= 35:
		status = "FAIR_PROSPERITY"
		taxAdvantage := float64(36-taxRate) / 15.0
		civicFactor := 1.0 + float64(infrastructure)*0.20 + float64(socialCosts)*0.015
		prideBonus := 0.70 + 0.30*(pride/100.0)
		gRate := 0.005 * taxAdvantage * civicFactor * prideBonus
		generalMig = int64(math.Round(float64(generalPop) * gRate))
		if generalMig < 1 {
			generalMig = 1
		}

		wRate := 0.002 * taxAdvantage * (1.0 + float64(markets)*0.15) * prideBonus
		wealthyMig = int64(math.Round(float64(wealthyPop) * wRate))
		capitalDrain = wealthyMig * 3

	// Threshold 3: Moderate / Normal Taxation (36% <= taxRate <= 58%)
	case taxRate <= 58:
		status = "MODERATE_TAX"
		if socialCosts >= 50 {
			welfarePull := float64(socialCosts-50) * 0.00004
			generalMig = int64(math.Round(float64(generalPop) * welfarePull))
		}

	// Threshold 4: High / Heavy Taxation (59% <= taxRate <= 68%)
	case taxRate <= 68:
		status = "HEAVY_DRAG"
		excess := float64(taxRate - 58)
		relief := float64(socialCosts) * 0.10
		effExcess := math.Max(0, excess-relief)

		wRate := (effExcess / 10.0) * 0.008
		wealthyMig = -int64(math.Ceil(float64(wealthyPop) * wRate))

		gRate := (effExcess / 10.0) * 0.004
		generalMig = -int64(math.Ceil(float64(generalPop) * gRate))
		capitalDrain = wealthyMig * 5

	// Threshold 5: Extreme / Punitive Taxation (taxRate > 68%)
	default:
		status = "WEALTH_FLIGHT"
		excess := float64(taxRate - 60)
		relief := float64(socialCosts) * 0.12
		effExcess := math.Max(1.0, excess-relief)

		prideDrag := 1.0 + (1.0-pride/100.0)*0.5
		wRate := math.Min(0.040, (effExcess/32.0)*0.030*prideDrag)
		wealthyMig = -int64(math.Ceil(float64(wealthyPop) * wRate))
		if wealthyMig > -1 && wealthyPop > 10 {
			wealthyMig = -1
		}

		gRate := math.Min(0.015, (effExcess/32.0)*0.012*prideDrag)
		generalMig = -int64(math.Ceil(float64(generalPop) * gRate))
		if generalMig > -1 && generalPop > 100 {
			generalMig = -1
		}

		// Demographic resilience: if a realm is severely depopulated, agrarian peasants cannot easily flee
		if population < 500 {
			wealthyMig = 0
			generalMig = 0
		}
		capitalDrain = wealthyMig * 10 // Capital flight (gold drains from treasury)
	}

	netMig := wealthyMig + generalMig
	return MigrationBreakdown{
		NetMigration:       netMig,
		WealthyMigration:   wealthyMig,
		GeneralMigration:   generalMig,
		WealthFactor:       wealthFactor,
		WealthyRatio:       wealthyRatio,
		CapitalFlightDrain: capitalDrain,
		MigrationStatus:    status,
	}
}

// ComputeMigrationWithPride preserves backward compatibility for existing callers and tests.
func ComputeMigrationWithPride(population, taxRate, socialCosts, infrastructure int64, pride float64) int64 {
	baseGDP := int64(math.Round(float64(population) * baseProductivity))
	res := ComputeMigrationDetailed(population, 500, baseGDP, taxRate, 0, infrastructure, socialCosts, pride)
	return res.NetMigration
}

// ComputeMigration returns the net annual population migration for a kingdom.
func ComputeMigration(population, taxRate, socialCosts, infrastructure int64) int64 {
	return ComputeMigrationWithPride(population, taxRate, socialCosts, infrastructure, 100.0)
}

// ComputeEconomy derives all dashboard and annual budget indicators from persisted state.
func ComputeEconomy(population, resources, troops, taxRate, markets, infrastructure, investment, socialCosts int64) EconomyState {
	return ComputeEconomyWithLayers(population, resources, troops, taxRate, markets, infrastructure, investment, socialCosts, 0, troops, 0)
}

// ComputeEconomyWithLayers derives all economic, budget, and military ledger indicators
// incorporating tiered military units (levies, regulars, elites) with baseline internals.
func ComputeEconomyWithLayers(
	population, resources, troops, taxRate, markets, infrastructure, investment, socialCosts int64,
	levy, regular, elite int64,
) EconomyState {
	return ComputeEconomyWithInternals(
		population, resources, troops, taxRate, markets, infrastructure, investment, socialCosts,
		levy, regular, elite, 100.0, 0, 1500.0,
	)
}

// ComputeEconomyWithInternals incorporates all user settings, internal states (entrepreneurial pride, delayed military liabilities),
// and environmental factors (seasonal harvest and winter logistics modifiers).
func ComputeEconomyWithInternals(
	population, resources, troops, taxRate, markets, infrastructure, investment, socialCosts int64,
	levy, regular, elite int64,
	pride float64, delayedCosts int64, simYear float64,
) EconomyState {
	return ComputeEconomyFull(
		population, resources, troops, taxRate, markets, infrastructure, investment, socialCosts,
		levy, regular, elite,
		pride, delayedCosts, 0.0, simYear,
	)
}

// ComputeEconomyFull incorporates all user settings, internal states (entrepreneurial pride, delayed military liabilities,
// compounded colonial expedition yields), and environmental factors (seasonal harvest and winter logistics modifiers).
func ComputeEconomyFull(
	population, resources, troops, taxRate, markets, infrastructure, investment, socialCosts int64,
	levy, regular, elite int64,
	pride float64, delayedCosts int64, colonialYield float64, simYear float64,
) EconomyState {
	if pride < 0 {
		pride = 0
	}
	if pride > 100 {
		pride = 100
	}
	if delayedCosts < 0 {
		delayedCosts = 0
	}
	if colonialYield < 0 {
		colonialYield = 0
	}

	season := GetClimaticAndSeasonalState(simYear)

	gdp := gdpValue(population, troops, taxRate, markets, infrastructure)
	// Investment and completed colonial expedition yields compound GDP; harvest factor modulates seasonal agricultural GDP output
	gdp *= (1.0 + investmentBoost*float64(investment) + colonialYield) * season.HarvestYieldFactor
	revenue := int64(gdp*float64(taxRate)/100.0 + 0.5)

	// Entrepreneurial Pride, Colonial Fleets Trade Yield & Seasonal Trade Velocity modulate market revenue
	prideFactor := 0.40 + 0.60*(pride/100.0)
	marketRev := int64(float64(markets*12) * prideFactor * (1.0 + colonialYield) * season.CommercialVelocity)
	if markets == 0 && colonialYield > 0 {
		marketRev = int64(colonialYield * 250.0 * season.CommercialVelocity)
	}
	totalRev := revenue + marketRev
	if totalRev < 0 {
		totalRev = 0
	}

	// Standing troop upkeep:
	// Levy: 2.0 gold/troop (peasant militia, cheap upkeep)
	// Regular: 6.0 gold/troop (disciplined standing footmen, arms, armor)
	// Elite: 18.0 gold/troop (royal tercios, knightly retinues, high maintenance)
	var standingMilUpkeep int64
	if (levy + regular + elite) > 0 {
		standingMilUpkeep = int64(math.Round(float64(levy)*2.0 + float64(regular)*6.0 + float64(elite)*18.0))
	} else {
		standingMilUpkeep = int64(float64(troops)*troopUpkeep + 0.5)
	}

	// Winter severity applies winter logistics burden to standing military
	if season.Season == "Winter" && standingMilUpkeep > 0 {
		standingMilUpkeep = int64(math.Round(float64(standingMilUpkeep) * season.WinterSeverity))
	}

	// Total military upkeep includes standing upkeep PLUS lingering delayed liabilities from past military campaigns/recruitment
	milUpkeep := standingMilUpkeep + delayedCosts

	// Cathedral tithes, civic administration, and court justice (scaled up to 30% of GDP at 100% dial):
	socialSpend := int64(math.Round(float64(socialCosts)*2.0 + float64(gdp)*(float64(socialCosts)/100.0)*0.30))
	// Colonial expeditions, trading ventures, and capital investment (scaled up to 30% of GDP at 100% dial):
	investmentSpend := int64(math.Round(float64(investment)*2.0 + float64(gdp)*(float64(investment)/100.0)*0.30))
	expenditure := milUpkeep + socialSpend + investmentSpend
	balance := totalRev - expenditure

	// Population pressure & welfare burden:
	// High population requires higher baseline Cathedral & Guild welfare to avoid squalor
	baseWelfareNeed := int64(float64(population) * 0.0008)
	popPressure := ComputePopulationPressure(population, troops, infrastructure, socialCosts)
	if socialSpend < baseWelfareNeed && baseWelfareNeed > 0 {
		squalor := (float64(baseWelfareNeed-socialSpend) / float64(baseWelfareNeed)) * 20.0
		popPressure = math.Min(100.0, popPressure+squalor)
	}

	// Manpower recruitment discount: abundant population makes recruiting cheaper (up to 50%)
	manpowerDiscount := math.Max(0.50, 1.0-(float64(population)/20000000.0)*0.50)

	// Enforce Layer 1 Hard-Specie Fiscal Rules:
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

	value := 1.0
	if gdp > 0 {
		value = (float64(resources) / gdp) / currencyBackingRatio
	}
	inflation := 0.0
	if balance < 0 {
		inflation = -float64(balance) * inflationDrift
	}
	inflation += float64(socialCosts) * inflationSocial
	inflation += float64(investment) * inflationInvestment
	if inflation < 0 {
		inflation = 0
	}
	if inflation > 100 {
		inflation = 100
	}

	mig := ComputeMigrationDetailed(population, resources, int64(gdp+0.5), taxRate, markets, infrastructure, socialCosts, pride)

	return EconomyState{
		TaxRate:                 taxRate,
		GDP:                     int64(gdp + 0.5),
		TaxRevenue:              revenue,
		MarketRevenue:           marketRev,
		TotalRevenue:            totalRev,
		MilitaryUpkeep:          milUpkeep,
		SocialExpenditure:       socialSpend,
		InvestmentExpenditure:   investmentSpend,
		MilitaryExpenditure:     expenditure,
		TroopsLevy:              levy,
		TroopsRegular:           regular,
		TroopsElite:             elite,
		BudgetBalance:           balance,
		EffectiveMilitaryExp:    effMil,
		EffectiveSocialExp:      effSoc,
		EffectiveInvestmentExp:  effInv,
		EffectiveTotalExp:       effTotalExp,
		EffectiveBalance:        effBalance,
		DeficitCapped:           capped,
		FiscalRegime:            fiscalRegime,
		GoldReserve:             resources,
		CurrencyValue:           value,
		InflationRate:           inflation,
		Investment:              investment,
		SocialCosts:             socialCosts,
		Markets:                 markets,
		Infrastructure:          infrastructure,
		PopulationPressure:      popPressure,
		NetMigration:            mig.NetMigration,
		WealthFactor:            mig.WealthFactor,
		WealthyRatio:            mig.WealthyRatio,
		WealthyMigration:        mig.WealthyMigration,
		GeneralMigration:        mig.GeneralMigration,
		CapitalFlightDrain:      mig.CapitalFlightDrain,
		MigrationStatus:         mig.MigrationStatus,
		EntrepreneurialPride:    pride,
		MilitaryDelayedCosts:    delayedCosts,
		SeasonalHarvestFactor:   season.HarvestYieldFactor,
		WinterSeverityFactor:    season.WinterSeverity,
		ManpowerRecruitDiscount: manpowerDiscount,
		WelfareSqualorBurden:    baseWelfareNeed,
		Season:                  season.Season,
		SeasonName:              season.SeasonName,
		LittleIceAgePhase:       season.LittleIceAgePhase,
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
	baseCap := 15000000.0 * (1.0 + float64(infrastructure)*0.15 + float64(markets)*0.10)
	effectiveCapacity := int64(math.Max(baseCap, 3000000.0))
	if population >= effectiveCapacity {
		return 0
	}
	perCapita := gdpValue(population, 0, taxRate, markets, infrastructure) / float64(population)
	growth := float64(population) * 0.005 * (perCapita / baseProductivity)
	growth += float64(investment+socialCosts) * 0.0005

	// Gradual demographic drag: high taxation blunts family formation and birth rates over multi-year periods
	if taxRate > 50 {
		blunt := math.Max(0.15, 1.0-float64(taxRate-50)/50.0)
		growth *= blunt
	}

	// Logistic damping: the closer the kingdom is to its carrying capacity, the
	// slower it grows. Without this the growth term is proportional to the
	// population itself, and budget balances grow unbounded.
	damped := growth * (1.0 - float64(population)/float64(effectiveCapacity))
	if damped < 0 {
		return 0
	}
	return int64(math.Round(damped))
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
