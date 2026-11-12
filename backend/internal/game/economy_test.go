package game

import (
	"strings"
	"testing"

	"kingdom-conquest/backend/internal/database"
)

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

func TestBalancedBudgetNoDeficit(t *testing.T) {
	// 1. Surplus scenario: total revenue exceeds desired spending -> not capped
	effMil, effSoc, effInv, capped := EnforceBalancedBudget(100, 30, 20, 20)
	if capped {
		t.Errorf("expected uncapped budget when revenue (100) > expenditure (70)")
	}
	if effMil != 30 || effSoc != 20 || effInv != 20 {
		t.Errorf("expected exact allocations 30/20/20, got %d/%d/%d", effMil, effSoc, effInv)
	}

	// 2. Discretionary overspend: military fits (40 <= 100), but social (50) + investment (50) exceed remaining (60)
	effMil2, effSoc2, effInv2, capped2 := EnforceBalancedBudget(100, 40, 50, 50)
	if !capped2 {
		t.Errorf("expected DeficitCapped=true when planned spending (140) > revenue (100)")
	}
	if effMil2 != 40 {
		t.Errorf("expected military upkeep to have first priority (40), got %d", effMil2)
	}
	if effMil2+effSoc2+effInv2 != 100 {
		t.Errorf("expected total effective expenditure to equal total revenue (100) with zero deficit, got %d",
			effMil2+effSoc2+effInv2)
	}

	// 3. Military overspend alone exceeds revenue: military capped at revenue, discretionary zeroed
	effMil3, effSoc3, effInv3, capped3 := EnforceBalancedBudget(50, 80, 25, 25)
	if !capped3 {
		t.Errorf("expected DeficitCapped=true when military upkeep exceeds revenue")
	}
	if effMil3 != 50 || effSoc3 != 0 || effInv3 != 0 {
		t.Errorf("expected 50/0/0 under military overspend, got %d/%d/%d", effMil3, effSoc3, effInv3)
	}

	// 4. Verify ComputeEconomy:
	// A) Kingdom with gold reserves can run a deficit by drawing down treasury reserves:
	withReserves := ComputeEconomy(1000, 500, 500, 40, 0, 0, 100, 100)
	if withReserves.EffectiveBalance >= 0 {
		t.Errorf("expected deficit (EffectiveBalance < 0) when planned spending exceeds revenue with reserves, got %d", withReserves.EffectiveBalance)
	}
	if withReserves.FiscalRegime != "DEFICIT_RESERVE_DRAIN" {
		t.Errorf("expected DEFICIT_RESERVE_DRAIN fiscal regime, got %q", withReserves.FiscalRegime)
	}

	// B) Kingdom with exhausted treasury (resources == 0) has outlays strictly capped to revenue (Hard-Specie Rule):
	broke := ComputeEconomy(1000, 0, 500, 40, 0, 0, 100, 100)
	if broke.EffectiveBalance < 0 {
		t.Errorf("expected broke kingdom to have EffectiveBalance >= 0 (strictly capped to revenue), got %d", broke.EffectiveBalance)
	}
	if !broke.DeficitCapped {
		t.Errorf("expected DeficitCapped=true for broke overextended kingdom")
	}
	if broke.FiscalRegime != "HARD_SPECIE_RATIONING" {
		t.Errorf("expected HARD_SPECIE_RATIONING fiscal regime, got %q", broke.FiscalRegime)
	}
}

func TestTaxDrivenMigration(t *testing.T) {
	// Confiscatory taxes (> 60%) trigger negative migration (emigration / tax flight)
	mig70 := ComputeMigration(10000, 70, 0, 1)
	mig95 := ComputeMigration(10000, 95, 0, 1)
	if mig70 >= 0 {
		t.Errorf("expected emigration (negative migration) at 70%% tax, got %d", mig70)
	}
	if mig95 >= mig70 {
		t.Errorf("expected worse tax flight at 95%% (%d) than at 70%% (%d)", mig95, mig70)
	}

	// Social spending cushions tax flight
	mig75NoSocial := ComputeMigration(50000, 75, 0, 1)
	mig75HighSocial := ComputeMigration(50000, 75, 80, 1)
	if mig75HighSocial <= mig75NoSocial {
		t.Errorf("expected social spending to cushion emigration (got %d vs %d)", mig75HighSocial, mig75NoSocial)
	}

	// Low taxes (<= 35%) with infrastructure attract immigrants
	imm := ComputeMigration(10000, 20, 30, 3)
	if imm <= 0 {
		t.Errorf("expected positive immigration under low taxes and good infrastructure, got %d", imm)
	}
}

func TestPopulationPressure(t *testing.T) {
	lowDensity := ComputePopulationPressure(5000, 50, 3, 20)
	highDensity := ComputePopulationPressure(400000, 50, 0, 0)
	if highDensity <= lowDensity {
		t.Errorf("expected higher population pressure with large unserviced population (%f vs %f)", highDensity, lowDensity)
	}

	lowArmy := ComputePopulationPressure(10000, 100, 2, 10)
	highArmy := ComputePopulationPressure(10000, 4000, 2, 10)
	if highArmy <= lowArmy {
		t.Errorf("expected higher population pressure under heavy military mobilization (%f vs %f)", highArmy, lowArmy)
	}
}

func TestLastYearExpenditureTracking(t *testing.T) {
	econ := ComputeEconomy(10000, 1000, 50, 50, 2, 2, 20, 20)

	// Initial fallback when persisted last-year values are all zero
	PopulateLastYearLedger(&econ, 0, 0, 0, 0, 0, 0, 0, 0)
	if econ.LastTaxRevenue != econ.TaxRevenue || econ.LastTotalExp != econ.EffectiveTotalExp {
		t.Errorf("expected fallback to populate current baseline into Last Year ledger")
	}

	// Explicit persisted last-year values
	PopulateLastYearLedger(&econ, 120, 24, 30, 10, 15, 55, 89, -12)
	if econ.LastTaxRevenue != 120 || econ.LastMarketIncome != 24 || econ.LastTotalExp != 55 || econ.LastMigration != -12 {
		t.Errorf("expected explicit last-year ledger values to be preserved, got %+v", econ)
	}
}

func TestComputeEconomyWithLayersAndSocialScaling(t *testing.T) {
	// 1. Differentiated Military Upkeep across Tiers
	levyEcon := ComputeEconomyWithLayers(10000, 2000, 100, 50, 0, 0, 0, 0, 100, 0, 0)
	regEcon := ComputeEconomyWithLayers(10000, 2000, 100, 50, 0, 0, 0, 0, 0, 100, 0)
	eliteEcon := ComputeEconomyWithLayers(10000, 2000, 100, 50, 0, 0, 0, 0, 0, 0, 100)

	if levyEcon.MilitaryUpkeep != 200 {
		t.Errorf("expected levy upkeep to be 200 (2.0/troop), got %d", levyEcon.MilitaryUpkeep)
	}
	if regEcon.MilitaryUpkeep != 600 {
		t.Errorf("expected regular upkeep to be 600 (6.0/troop), got %d", regEcon.MilitaryUpkeep)
	}
	if eliteEcon.MilitaryUpkeep != 1800 {
		t.Errorf("expected elite upkeep to be 1800 (18.0/troop), got %d", eliteEcon.MilitaryUpkeep)
	}
	if eliteEcon.MilitaryUpkeep <= regEcon.MilitaryUpkeep || regEcon.MilitaryUpkeep <= levyEcon.MilitaryUpkeep {
		t.Errorf("expected military upkeep to strictly escalate by tier (levy < regular < elite)")
	}

	// 2. Cathedral Tithes and Social Spending Scaling
	zeroSoc := ComputeEconomyWithLayers(10000, 2000, 0, 50, 2, 2, 0, 0, 0, 0, 0)
	midSoc := ComputeEconomyWithLayers(10000, 2000, 0, 50, 2, 2, 0, 40, 0, 0, 0)
	highSoc := ComputeEconomyWithLayers(10000, 2000, 0, 50, 2, 2, 0, 80, 0, 0, 0)

	if zeroSoc.SocialExpenditure != 0 {
		t.Errorf("expected zero social expenditure at 0%%, got %d", zeroSoc.SocialExpenditure)
	}
	if midSoc.SocialExpenditure <= 20 {
		t.Errorf("expected meaningful scaled cathedral/social spending at 40%% (got %d)", midSoc.SocialExpenditure)
	}
	if highSoc.SocialExpenditure <= midSoc.SocialExpenditure {
		t.Errorf("expected higher cathedral/social spending at 80%% than 40%% (got %d vs %d)",
			highSoc.SocialExpenditure, midSoc.SocialExpenditure)
	}
}

func TestSeasonalAndClimaticCycles(t *testing.T) {
	// Verify 4 seasons across simulation year fractions
	spring := GetClimaticAndSeasonalState(1500.10)
	summer := GetClimaticAndSeasonalState(1500.35)
	autumn := GetClimaticAndSeasonalState(1500.65)
	winter := GetClimaticAndSeasonalState(1500.85)

	if spring.Season != "Spring" {
		t.Errorf("expected Spring at 1500.10, got %s", spring.Season)
	}
	if summer.Season != "Summer" {
		t.Errorf("expected Summer at 1500.35, got %s", summer.Season)
	}
	if autumn.Season != "Autumn" {
		t.Errorf("expected Autumn at 1500.65, got %s", autumn.Season)
	}
	if winter.Season != "Winter" {
		t.Errorf("expected Winter at 1500.85, got %s", winter.Season)
	}

	// Autumn harvest yields should be greater than winter yields
	if autumn.HarvestYieldFactor <= winter.HarvestYieldFactor {
		t.Errorf("expected autumn harvest factor (%f) > winter harvest factor (%f)",
			autumn.HarvestYieldFactor, winter.HarvestYieldFactor)
	}

	// Winter severity modifier increases military winter upkeep
	if winter.WinterSeverity <= spring.WinterSeverity {
		t.Errorf("expected winter severity (%f) > spring severity (%f)",
			winter.WinterSeverity, spring.WinterSeverity)
	}

	// Little Ice Age solar minimums (Maunder Minimum 1645-1715)
	maunderWinter := GetClimaticAndSeasonalState(1680.85)
	if maunderWinter.WinterSeverity <= winter.WinterSeverity {
		t.Errorf("expected Maunder minimum winter (%f) to be more severe than 1500 winter (%f)",
			maunderWinter.WinterSeverity, winter.WinterSeverity)
	}
}

func TestInternalStateEntrepreneurialPrideAndDelayedCosts(t *testing.T) {
	// 1. Entrepreneurial Pride modulates market income
	highPrideEcon := ComputeEconomyWithInternals(10000, 2000, 0, 30, 5, 0, 0, 0, 0, 0, 0, 100.0, 0, 1500.20)
	crushedPrideEcon := ComputeEconomyWithInternals(10000, 2000, 0, 30, 5, 0, 0, 0, 0, 0, 0, 20.0, 0, 1500.20)

	if crushedPrideEcon.MarketRevenue >= highPrideEcon.MarketRevenue {
		t.Errorf("expected crushed pride market revenue (%d) to be lower than high pride revenue (%d)",
			crushedPrideEcon.MarketRevenue, highPrideEcon.MarketRevenue)
	}

	// 2. Delayed Military Liabilities add to total military upkeep
	noDelayedEcon := ComputeEconomyWithInternals(10000, 2000, 100, 30, 0, 0, 0, 0, 0, 100, 0, 100.0, 0, 1500.20)
	withDelayedEcon := ComputeEconomyWithInternals(10000, 2000, 100, 30, 0, 0, 0, 0, 0, 100, 0, 100.0, 500, 1500.20)

	if withDelayedEcon.MilitaryUpkeep != noDelayedEcon.MilitaryUpkeep+500 {
		t.Errorf("expected total military upkeep to reflect delayed liabilities (%d vs %d)",
			withDelayedEcon.MilitaryUpkeep, noDelayedEcon.MilitaryUpkeep+500)
	}

	// 3. Manpower Recruitment Discount scales with population size
	smallPopEcon := ComputeEconomyWithInternals(500000, 2000, 0, 30, 0, 0, 0, 0, 0, 0, 0, 100.0, 0, 1500.0)
	largePopEcon := ComputeEconomyWithInternals(15000000, 2000, 0, 30, 0, 0, 0, 0, 0, 0, 0, 100.0, 0, 1500.0)

	if largePopEcon.ManpowerRecruitDiscount >= smallPopEcon.ManpowerRecruitDiscount {
		t.Errorf("expected large kingdom manpower discount (%f) to be more generous than small kingdom (%f)",
			largePopEcon.ManpowerRecruitDiscount, smallPopEcon.ManpowerRecruitDiscount)
	}
}

func TestWealthFactorAndSegmentedMigrationThresholds(t *testing.T) {
	// 1. Wealth factor & percentage of wealthy: agrarian vs advanced merchant hub
	agrarianScore, agrarianRatio := ComputeWealthFactor(1000000, 100, 80000, 0, 0, 50.0)
	merchantScore, merchantRatio := ComputeWealthFactor(1000000, 100000, 240000, 5, 5, 100.0)

	if merchantScore <= agrarianScore {
		t.Errorf("expected merchant hub wealth score (%f) to exceed agrarian score (%f)", merchantScore, agrarianScore)
	}
	if merchantRatio <= agrarianRatio {
		t.Errorf("expected higher proportion of wealthy in developed merchant hub (%f vs %f)", merchantRatio, agrarianRatio)
	}
	if agrarianRatio < 0.02 || agrarianRatio > 0.10 {
		t.Errorf("expected agrarian wealthy ratio between 2%% and 10%%, got %f", agrarianRatio)
	}
	if merchantRatio < 0.10 || merchantRatio > 0.18 {
		t.Errorf("expected merchant hub wealthy ratio between 10%% and 18%%, got %f", merchantRatio)
	}

	// 2. Low Tax Threshold (<= 20%): Capital Haven attracting wealthy relocations and capital injection
	havenMig := ComputeMigrationDetailed(1000000, 10000, 120000, 15, 3, 2, 0, 90.0)
	if havenMig.MigrationStatus != "CAPITAL_HAVEN" {
		t.Errorf("expected CAPITAL_HAVEN status at 15%% tax, got %s", havenMig.MigrationStatus)
	}
	if havenMig.WealthyMigration <= 0 {
		t.Errorf("expected positive wealthy immigration under 15%% tax haven, got %d", havenMig.WealthyMigration)
	}
	if havenMig.CapitalFlightDrain <= 0 {
		t.Errorf("expected positive capital injection (+gold) under tax haven, got %d", havenMig.CapitalFlightDrain)
	}

	// 3. Fair Tax Threshold (21% - 35%): Fair Prosperity attracting general settlers
	fairMig := ComputeMigrationDetailed(1000000, 10000, 120000, 28, 2, 2, 20, 85.0)
	if fairMig.MigrationStatus != "FAIR_PROSPERITY" {
		t.Errorf("expected FAIR_PROSPERITY status at 28%% tax, got %s", fairMig.MigrationStatus)
	}
	if fairMig.GeneralMigration <= 0 {
		t.Errorf("expected positive general settler immigration at 28%% tax, got %d", fairMig.GeneralMigration)
	}

	// 4. Extreme Tax Threshold (> 68%): Confiscatory Wealth Flight
	flightMig := ComputeMigrationDetailed(1000000, 10000, 120000, 80, 2, 2, 0, 40.0)
	if flightMig.MigrationStatus != "WEALTH_FLIGHT" {
		t.Errorf("expected WEALTH_FLIGHT status at 80%% tax, got %s", flightMig.MigrationStatus)
	}
	if flightMig.WealthyMigration >= 0 {
		t.Errorf("expected negative wealthy migration (flight) under 80%% tax, got %d", flightMig.WealthyMigration)
	}
	if flightMig.CapitalFlightDrain >= 0 {
		t.Errorf("expected capital flight specie drain (negative) under 80%% tax, got %d", flightMig.CapitalFlightDrain)
	}
	if flightMig.NetMigration >= 0 {
		t.Errorf("expected negative net migration under 80%% tax, got %d", flightMig.NetMigration)
	}
}

func TestColonialGestationAndLexicon(t *testing.T) {
	// 1. Gestation period shrinks as eras advance
	discGest := GetColonialGestationYears(1500.0)
	revoltGest := GetColonialGestationYears(1760.0)
	indGest := GetColonialGestationYears(1880.0)
	decolGest := GetColonialGestationYears(1940.0)
	modGest := GetColonialGestationYears(2005.0)

	if discGest != 2.0 || revoltGest != 1.5 || indGest != 1.0 || decolGest != 0.5 || modGest != 0.35 {
		t.Errorf("unexpected gestation periods: disc=%f, revolt=%f, ind=%f, decol=%f, mod=%f",
			discGest, revoltGest, indGest, decolGest, modGest)
	}

	// 2. Era keys
	if GetEraKey(1500) != "discovery" || GetEraKey(1760) != "revolt" || GetEraKey(1880) != "independence" ||
		GetEraKey(1940) != "decolonisation" || GetEraKey(2000) != "modern" {
		t.Errorf("unexpected era key mapping")
	}

	// 3. Port naming
	if RealmPort("ENG", "England") != "Portsmouth" {
		t.Errorf("expected Portsmouth for ENG, got %s", RealmPort("ENG", "England"))
	}
	if RealmPort("SPA", "Spain") != "Seville" {
		t.Errorf("expected Seville for SPA, got %s", RealmPort("SPA", "Spain"))
	}

	// 4. Milestone, Return, and Abandonment News generators
	m1 := GenerateColonialMilestoneDispatch("discovery", "England", "Portsmouth", 20.0, 4.0)
	if m1 == "" || !strings.Contains(m1, "Portsmouth") {
		t.Errorf("expected valid milestone dispatch, got: %s", m1)
	}

	ret := GenerateColonialVoyageReturnDispatch("discovery", "England", "Portsmouth", 10, 2)
	if !strings.Contains(ret, "Fleet 2") || !strings.Contains(ret, "+10%") {
		t.Errorf("expected valid return dispatch, got: %s", ret)
	}

	abandon := GenerateColonialAbandonmentDispatch("discovery", "England", "Portsmouth")
	if !strings.Contains(abandon, "unpaid shipwrights") {
		t.Errorf("expected valid abandonment dispatch, got: %s", abandon)
	}

	// 5. Colonial trade yield bonus compounds GDP & market revenue in ComputeEconomyFull
	zeroColonialEcon := ComputeEconomyFull(1000000, 50000, 100, 30, 5, 2, 0, 0, 0, 100, 0, 100.0, 0, 0.0, 1500.25, 1.0, 1.0)
	boostedColonialEcon := ComputeEconomyFull(1000000, 50000, 100, 30, 5, 2, 0, 0, 0, 100, 0, 100.0, 0, 0.15, 1500.25, 1.0, 1.0)

	if boostedColonialEcon.GDP <= zeroColonialEcon.GDP {
		t.Errorf("expected +15%% colonial yield to increase GDP (%d vs %d)", boostedColonialEcon.GDP, zeroColonialEcon.GDP)
	}
	if boostedColonialEcon.MarketRevenue <= zeroColonialEcon.MarketRevenue {
		t.Errorf("expected +15%% colonial yield to boost market revenue (%d vs %d)",
			boostedColonialEcon.MarketRevenue, zeroColonialEcon.MarketRevenue)
	}

	// 6. Increasing investment dial alone while building ships DOES NOT immediately boost GDP or trade revenue
	noInvestEcon := ComputeEconomyFull(1000000, 50000, 100, 30, 5, 2, 0, 0, 0, 100, 0, 100.0, 0, 0.0, 1500.25, 1.0, 1.0)
	highInvestBuildingEcon := ComputeEconomyFull(1000000, 50000, 100, 30, 5, 2, 80, 0, 0, 100, 0, 100.0, 0, 0.0, 1500.25, 1.0, 1.0)

	if highInvestBuildingEcon.GDP != noInvestEcon.GDP {
		t.Errorf("expected GDP to remain unchanged while ships are under construction (delayed returns): got %d vs %d",
			highInvestBuildingEcon.GDP, noInvestEcon.GDP)
	}
	if highInvestBuildingEcon.MarketRevenue != noInvestEcon.MarketRevenue {
		t.Errorf("expected market revenue to remain unchanged while ships are under construction: got %d vs %d",
			highInvestBuildingEcon.MarketRevenue, noInvestEcon.MarketRevenue)
	}
	if highInvestBuildingEcon.InvestmentExpenditure <= 0 {
		t.Errorf("expected high investment expenditure during shipbuilding capex, got %d",
			highInvestBuildingEcon.InvestmentExpenditure)
	}

	// 7. Era-specific annual expenditure and total multi-year project commitment costs (Default: 12 per %)
	if GetEraExpeditionAnnualCost(1500) != 1200.0 || GetEraExpeditionTotalCost(1500) != 2400.0 {
		t.Errorf("expected Discovery: 1200 gold/yr for 2 yrs (total 2400), got annual=%f, total=%f",
			GetEraExpeditionAnnualCost(1500), GetEraExpeditionTotalCost(1500))
	}
	if GetEraExpeditionAnnualCost(1760) != 1800.0 || GetEraExpeditionTotalCost(1760) != 2700.0 {
		t.Errorf("expected Revolt: 1800 gold/yr for 1.5 yrs (total 2700), got annual=%f, total=%f",
			GetEraExpeditionAnnualCost(1760), GetEraExpeditionTotalCost(1760))
	}
	if GetEraExpeditionAnnualCost(1880) != 3000.0 || GetEraExpeditionTotalCost(1880) != 3000.0 {
		t.Errorf("expected Independence: 3000 gold/yr for 1.0 yrs (total 3000), got annual=%f, total=%f",
			GetEraExpeditionAnnualCost(1880), GetEraExpeditionTotalCost(1880))
	}

	// 8. Solvency check: pre-modern realms must have adequate reserves to support expedition spending
	// In Discovery with 600 gold: 100% requires 2400 gold -> rejected, max affordable is 25% (600 gold)
	allowed100, maxAff100, req100, _ := CheckExpeditionAffordability(600, 100, 1500)
	if allowed100 || maxAff100 != 25 || req100 != 2400 {
		t.Errorf("expected 100%% investment rejected with 600 gold in Discovery: allowed=%v, maxAff=%d, req=%d",
			allowed100, maxAff100, req100)
	}

	allowed25, maxAff25, req25, _ := CheckExpeditionAffordability(600, 25, 1500)
	if !allowed25 || maxAff25 != 25 || req25 != 600 {
		t.Errorf("expected 25%% investment allowed with 600 gold in Discovery: allowed=%v, maxAff=%d, req=%d",
			allowed25, maxAff25, req25)
	}

	// Modern Era (1989+): Deficits permitted, so investments are allowed even with 0 reserves
	allowedModern, _, _, _ := CheckExpeditionAffordability(0, 100, 2000)
	if !allowedModern {
		t.Errorf("expected deficit allowed in Modern Age even with 0 reserves")
	}

	// 9. Zero tax rate with 60% expedition investment strictly produces a -720 gold/year exchequer deficit (12 * 60)
	zeroTaxExpEcon := ComputeEconomyFull(4000000, 5000, 0, 0, 0, 0, 60, 0, 0, 0, 0, 100.0, 0, 0.0, 1500.0, 1.0, 1.0)
	if zeroTaxExpEcon.TaxRevenue != 0 {
		t.Errorf("expected 0 tax revenue under 0%% tax rate, got %d", zeroTaxExpEcon.TaxRevenue)
	}
	if zeroTaxExpEcon.InvestmentExpenditure != 720 {
		t.Errorf("expected 60%% investment in Discovery to cost 720 gold/yr (12 * 60), got %d", zeroTaxExpEcon.InvestmentExpenditure)
	}
	if zeroTaxExpEcon.BudgetBalance != -720 || zeroTaxExpEcon.EffectiveBalance != -720 {
		t.Errorf("expected net budget balance of -720 gold/yr (reserves drain), got %d / %d",
			zeroTaxExpEcon.BudgetBalance, zeroTaxExpEcon.EffectiveBalance)
	}

	// 10. Completed voyage grants permanent trade yield proportional to investment dial
	baseYieldEcon := ComputeEconomyFull(4000000, 5000, 0, 0, 0, 0, 60, 0, 0, 0, 0, 100.0, 0, 0.0, 1500.0, 1.0, 1.0)
	completed60Econ := ComputeEconomyFull(4000000, 5000, 0, 0, 0, 0, 60, 0, 0, 0, 0, 100.0, 0, 0.03, 1500.0, 1.0, 1.0)
	if completed60Econ.GDP <= baseYieldEcon.GDP {
		t.Errorf("expected +3%% trade yield from completed 60%% fleet to raise GDP (%d vs %d)",
			completed60Econ.GDP, baseYieldEcon.GDP)
	}

	// 11. Custom admin pricing update adjusts annual cost and gestation
	table := GetExpeditionPricingTable()
	if len(table) < 5 {
		t.Fatalf("expected at least 5 era pricing configs, got %d", len(table))
	}
	table[0].CostPerPct = 20.0
	table[0].GestationYears = 1.0
	SetExpeditionPricingTable(table)
	if GetEraExpeditionCostPerPct(1500) != 20.0 || GetColonialGestationYears(1500) != 1.0 {
		t.Errorf("expected updated admin pricing 20 G/%% and 1.0 yr gestation, got %f and %f",
			GetEraExpeditionCostPerPct(1500), GetColonialGestationYears(1500))
	}
	// Restore default
	table[0].CostPerPct = 12.0
	table[0].GestationYears = 2.0
	SetExpeditionPricingTable(table)
}

func TestFairTaxThresholdAndHyperbolicLag(t *testing.T) {
	// 1. Fair Tax Threshold: Under 25%, zero effect on future productivity (target = 1.0)
	for tax := int64(0); tax <= 25; tax += 5 {
		if factor := TargetProductivityFactor(tax); factor != 1.0 {
			t.Errorf("expected TargetProductivityFactor(%d) == 1.0 under fair tax, got %f", tax, factor)
		}
	}

	// 2. Hyperbolic Curve Above 25%: Gradual drop-off becoming progressively steeper
	f35 := TargetProductivityFactor(35)
	f50 := TargetProductivityFactor(50)
	f75 := TargetProductivityFactor(75)
	f100 := TargetProductivityFactor(100)

	if f35 < 0.94 || f35 > 0.98 {
		t.Errorf("expected mild 2-6%% drag at 35%% tax, got %f", 1.0-f35)
	}
	if f50 >= f35 || f50 < 0.70 || f50 > 0.80 {
		t.Errorf("expected moderate ~25%% drag at 50%% tax, got %f", 1.0-f50)
	}
	if f75 >= f50 || f75 < 0.40 || f75 > 0.50 {
		t.Errorf("expected steep ~57%% drag at 75%% tax, got %f", 1.0-f75)
	}
	if f100 >= f75 || f100 != 0.25 {
		t.Errorf("expected ~75%% drop at 100%% tax (floor 0.25), got %f", f100)
	}

	// 3. Capital Investments (Fleets + Markets) do not vanish overnight:
	// Day 0 at 75% tax with high initial investor confidence (100.0 pride) retains full trade productivity
	initialEcon := ComputeEconomyWithInternals(10000, 2000, 0, 75, 2, 0, 0, 0, 0, 0, 0, 100.0, 0, 1500.0)
	// After 1 year at 75%, pride has only dropped partially towards 42.8%
	tau := 2.0
	targetPride := TargetProductivityFactor(75) * 100.0
	prideYear1 := 100.0 + ((targetPride - 100.0) / tau) * 1.0 // ~71.4%
	year1Econ := ComputeEconomyWithInternals(10000, 2000, 0, 75, 2, 0, 0, 0, 0, 0, 0, prideYear1, 0, 1501.0)

	if year1Econ.MarketRevenue >= initialEcon.MarketRevenue {
		t.Errorf("expected trade revenue after 1 yr to start dropping, got %d vs %d", year1Econ.MarketRevenue, initialEcon.MarketRevenue)
	}
	// Verify it only dropped ~25-30% rather than vanishing completely:
	ratio := float64(year1Econ.MarketRevenue) / float64(initialEcon.MarketRevenue)
	if ratio < 0.65 || ratio > 0.80 {
		t.Errorf("expected ~70%% capital retention after 1 yr of high tax, got ratio %f", ratio)
	}
}

func TestCountryFiscalProfileAndMaritimeCashflow(t *testing.T) {
	// 1. England (ENG): Maritime Archetype (tax_mod: 0.50, trade_mod: 1.80)
	// Population 4,500,000 at 50% tax rate
	engBase := ComputeEconomyFull(4500000, 600, 0, 50, 0, 0, 0, 0, 0, 0, 0, 100.0, 0, 0.0, 1500.0, 0.50, 1.80)
	// Base tax revenue in Spring 1500 Little Ice Age (~0.91 harvest factor): ~205-225 gold/yr
	if engBase.TaxRevenue < 190 || engBase.TaxRevenue > 235 {
		t.Errorf("expected England agrarian tax revenue of ~205-225 gold/yr at 50%% tax, got %d", engBase.TaxRevenue)
	}
	if engBase.MarketRevenue != 0 {
		t.Errorf("expected England initial trade revenue to be 0 without fleets/markets, got %d", engBase.MarketRevenue)
	}

	// Commission 1 caravel fleet (+5% colonial yield = 0.05):
	// Generates 0.05 * 1500 = 75 base * 1.05 * 1.80 tradeMod = ~142 gold/yr in customs & tariffs
	engFleet1 := ComputeEconomyFull(4500000, 600, 0, 50, 0, 0, 0, 0, 0, 0, 0, 100.0, 0, 0.05, 1500.0, 0.50, 1.80)
	if engFleet1.MarketRevenue < 130 || engFleet1.MarketRevenue > 155 {
		t.Errorf("expected single caravel fleet to earn ~142 gold/yr for England, got %d", engFleet1.MarketRevenue)
	}

	// Commission 3 caravel fleets (+15% colonial yield = 0.15):
	// Generates 0.15 * 1500 = 225 base * 1.15 * 1.80 tradeMod = ~466 gold/yr
	engFleet3 := ComputeEconomyFull(4500000, 600, 0, 50, 0, 0, 0, 0, 0, 0, 0, 100.0, 0, 0.15, 1500.0, 0.50, 1.80)
	if engFleet3.MarketRevenue <= engBase.TaxRevenue {
		t.Errorf("expected 3 caravel fleets to surpass England's agrarian tax revenue (%d vs %d)",
			engFleet3.MarketRevenue, engBase.TaxRevenue)
	}

	// 2. France (FRA): Agrarian Bureaucracy (tax_mod: 1.30, trade_mod: 0.65)
	// Population 16,000,000 at 50% tax rate
	fraBase := ComputeEconomyFull(16000000, 850, 0, 50, 0, 0, 0, 0, 0, 0, 0, 100.0, 0, 0.0, 1500.0, 1.30, 0.65)
	// 16,000,000 * 0.0002 = 3200 GDP * 50% tax * 1.30 taxMod * 0.91 harvest factor = ~1893 gold/yr
	if fraBase.TaxRevenue < 1800 || fraBase.TaxRevenue > 2150 {
		t.Errorf("expected France peasant taille revenue of ~1893-2080 gold/yr, got %d", fraBase.TaxRevenue)
	}

	// 3. Republic of Venice (VEN): Merchant Republic (tax_mod: 0.15, trade_mod: 2.50)
	// Population 1,800,000 at 50% tax rate
	venBase := ComputeEconomyFull(1800000, 700, 0, 50, 0, 0, 0, 0, 0, 0, 0, 100.0, 0, 0.0, 1500.0, 0.15, 2.50)
	// Agrarian land tax: 1,800,000 * 0.0002 = 360 GDP * 50% * 0.15 * 0.91 = ~25 gold/yr
	if venBase.TaxRevenue < 20 || venBase.TaxRevenue > 30 {
		t.Errorf("expected Venice land tax of only ~25-27 gold/yr, got %d", venBase.TaxRevenue)
	}
	// Venice with 1 trade fleet earns 0.05 * 1500 * 1.05 * 2.50 = ~197 gold/yr (7x its agrarian tax!)
	venFleet1 := ComputeEconomyFull(1800000, 700, 0, 50, 0, 0, 0, 0, 0, 0, 0, 100.0, 0, 0.05, 1500.0, 0.15, 2.50)
	if venFleet1.MarketRevenue < 180 {
		t.Errorf("expected Venice to earn supreme maritime tariffs (~197 gold/yr), got %d", venFleet1.MarketRevenue)
	}
}

func TestNextPeriodBudgetAppropriationAndLandlockedArchetypes(t *testing.T) {
	// 1. Verify Landlocked vs Sea-going Duality
	landlockedCodes := []string{"SWI", "AUT", "CZE", "BOL", "HUN", "PRY"}
	for _, code := range landlockedCodes {
		if !database.IsLandlockedRealm(code) {
			t.Errorf("expected %s to be classified as landlocked realm", code)
		}
	}

	maritimeCodes := []string{"ENG", "FRA", "NED", "ESP", "POR", "VEN", "DEN", "JPN"}
	for _, code := range maritimeCodes {
		if database.IsLandlockedRealm(code) {
			t.Errorf("expected %s to be classified as maritime/coastal realm", code)
		}
	}

	// 2. Verify Multi-Era Universal Archetype Profiles
	swiProf := database.GetCountryFiscalProfile("SWI")
	if swiProf.Archetype != "merchant_republic" || swiProf.IsSeaGoing {
		t.Errorf("expected SWI to be landlocked merchant republic, got %+v", swiProf)
	}

	usaProf := database.GetCountryFiscalProfile("USA")
	if usaProf.Archetype != "industrial_powerhouse" || !usaProf.IsSeaGoing {
		t.Errorf("expected USA to be industrial powerhouse, got %+v", usaProf)
	}

	sauProf := database.GetCountryFiscalProfile("SAU")
	if sauProf.Archetype != "commodity_rentier" {
		t.Errorf("expected SAU to be commodity rentier, got %+v", sauProf)
	}

	// 3. Verify Next-Period Budget Decoupling
	// Year Y active budget is 50% tax; player plans 30% for Year Y+1
	activeTaxRate := int64(50)
	plannedTaxRate := int64(30)

	activeEcon := ComputeEconomyFull(4500000, 600, 0, activeTaxRate, 0, 0, 0, 0, 0, 0, 0, 100.0, 0, 0.0, 1500.0, 0.50, 1.80)
	plannedEcon := ComputeEconomyFull(4500000, 600, 0, plannedTaxRate, 0, 0, 0, 0, 0, 0, 0, 100.0, 0, 0.0, 1501.0, 0.50, 1.80)

	if activeEcon.TaxRevenue == plannedEcon.TaxRevenue {
		t.Errorf("expected active 50%% tax revenue (%d) to differ from planned 30%% tax revenue (%d)",
			activeEcon.TaxRevenue, plannedEcon.TaxRevenue)
	}

	// In year Y, active extraction remains ~205-225 G
	if activeEcon.TaxRevenue < 190 || activeEcon.TaxRevenue > 235 {
		t.Errorf("expected Year Y active tax revenue to remain locked at 50%% (~205-225 G), got %d", activeEcon.TaxRevenue)
	}

	// In year Y+1 after ratification, planned rate generates 30/50 * active = ~123-140 G
	if plannedEcon.TaxRevenue > activeEcon.TaxRevenue*35/50 {
		t.Errorf("expected Year Y+1 planned tax revenue to reflect 30%% rate, got %d vs %d", plannedEcon.TaxRevenue, activeEcon.TaxRevenue)
	}
}

func TestCivicWelfareSqualorMortalityAndRevoltTaxonomy(t *testing.T) {
	// 1. Demographic Baseline Welfare Need Across All 5 Eras
	englandPop := int64(4500000)
	markets := int64(2)

	need1500 := ComputeWelfareNeed(englandPop, markets, 1500.0) // Discovery
	need1750 := ComputeWelfareNeed(englandPop, markets, 1750.0) // Revolt
	need1860 := ComputeWelfareNeed(englandPop, markets, 1860.0) // Independence
	need1920 := ComputeWelfareNeed(englandPop, markets, 1920.0) // Decolonisation
	need1989 := ComputeWelfareNeed(englandPop, markets, 1989.0) // Modern

	if need1500 < 50 || need1500 > 60 {
		t.Errorf("expected Era 1 welfare need ~52-53 G, got %d", need1500)
	}
	if need1750 <= need1500 || need1860 <= need1750 || need1920 <= need1860 || need1989 <= need1920 {
		t.Errorf("expected welfare need to increase across eras: %d < %d < %d < %d < %d",
			need1500, need1750, need1860, need1920, need1989)
	}

	// 2. Squalor & Excess Mortality Dynamics
	// Zero social spend: Q = 100%, Excess mortality > 80,000 / year
	squalorZero, deathsZero := ComputeSqualorAndMortality(englandPop, 0, need1500, 1500.0)
	if squalorZero != 100.0 {
		t.Errorf("expected 100%% squalor when social spending is 0, got %f", squalorZero)
	}
	if deathsZero < 80000 || deathsZero > 100000 {
		t.Errorf("expected ~90,000 excess deaths per year under complete squalor, got %d", deathsZero)
	}

	// Adequate social spend: Q = 0%, Excess mortality = 0
	squalorAdequate, deathsAdequate := ComputeSqualorAndMortality(englandPop, need1500+20, need1500, 1500.0)
	if squalorAdequate != 0.0 || deathsAdequate != 0 {
		t.Errorf("expected 0 squalor and 0 excess deaths with adequate spend, got %f squalor, %d deaths",
			squalorAdequate, deathsAdequate)
	}

	// 3. Imperial Unrest Index & Rebellion Trigger (U >= 85%)
	// Low tax (20%) + High Welfare + Fortifications -> Peaceful realm (U < 30%)
	unrestPeace, riskPeace := ComputeUnrestIndex(20, 0.0, englandPop, 1000, 1000, 2, 2, 1500.0)
	if unrestPeace >= 30.0 || riskPeace != "peace" {
		t.Errorf("expected low unrest in peace realm, got %f (%s)", unrestPeace, riskPeace)
	}

	// Confiscatory Tax (95%) + Squalor (100%) -> Rebellion Zone (U >= 85%)
	unrestRebel, riskRebel := ComputeUnrestIndex(95, 100.0, englandPop, 500, 200, 0, 0, 1500.0)
	if unrestRebel < 85.0 || riskRebel != "rebellion" {
		t.Errorf("expected armed rebellion outbreak (U >= 85%%), got %f (%s)", unrestRebel, riskRebel)
	}

	// 4. Verify Labelled News Lexicon Dispatches across All 5 Eras
	eras := []string{"discovery", "revolt", "independence", "decolonisation", "modern"}
	for _, era := range eras {
		safeMsg := GenerateCivicSafetyDispatch(era, "England", "Portsmouth")
		if !strings.Contains(safeMsg, "Portsmouth") && !strings.Contains(safeMsg, "England") {
			t.Errorf("civic safety dispatch missing realm/port for era %s: %s", era, safeMsg)
		}

		squalorMsg := GenerateSqualorMortalityDispatch(era, "England", "Portsmouth", 50000)
		if !strings.Contains(squalorMsg, "50000") && !strings.Contains(squalorMsg, "England") {
			t.Errorf("squalor mortality dispatch missing deaths for era %s: %s", era, squalorMsg)
		}

		rebelMsg := GenerateRebellionDispatch(era, "England", "Portsmouth")
		if !strings.Contains(rebelMsg, "🚨") {
			t.Errorf("rebellion dispatch missing alert icon for era %s: %s", era, rebelMsg)
		}

		restoredMsg := GenerateCivicOrderRestoredDispatch(era, "England", "Portsmouth")
		if !strings.Contains(restoredMsg, "🕊️") {
			t.Errorf("restored dispatch missing peace icon for era %s: %s", era, restoredMsg)
		}
	}
}

func TestEmergencyCrownAdvanceAnd13MonthTaxDrought(t *testing.T) {
	simYear := 1500.5
	englandPop := int64(4500000)

	econ := ComputeEconomyFull(englandPop, 500, 0, 50, 2, 1, 0, 0, 0, 0, 0, 100.0, 0, 0.0, simYear, 1.0, 1.0)
	if econ.TaxRevenue <= 0 {
		t.Fatalf("expected positive baseline tax revenue, got %d", econ.TaxRevenue)
	}

	// 1. Demand Advance: 13-month drought until 1500.5 + 1.0833 = 1501.5833
	droughtUntil := simYear + (13.0 / 12.0)
	baselineUnrest := econ.UnrestIndex

	// Apply during drought (simYear 1500.5 < droughtUntil)
	droughtEcon := econ
	ApplyTaxDrought(&droughtEcon, simYear, droughtUntil)

	if !droughtEcon.InTaxDrought {
		t.Errorf("expected InTaxDrought == true during 13-month window")
	}
	if droughtEcon.TaxRevenue != 0 {
		t.Errorf("expected TaxRevenue == 0 during tax drought, got %d", droughtEcon.TaxRevenue)
	}
	if droughtEcon.UnrestIndex != baselineUnrest+25.0 {
		t.Errorf("expected unrest shock +25%% (from %f to %f), got %f",
			baselineUnrest, baselineUnrest+25.0, droughtEcon.UnrestIndex)
	}

	// 2. After 13 months expire (simYear 1501.60 >= droughtUntil)
	expiredEcon := econ
	ApplyTaxDrought(&expiredEcon, 1501.60, droughtUntil)

	if expiredEcon.InTaxDrought {
		t.Errorf("expected InTaxDrought == false after drought expiration")
	}
	if expiredEcon.TaxRevenue <= 0 {
		t.Errorf("expected TaxRevenue to be restored after drought expiration, got %d", expiredEcon.TaxRevenue)
	}

	// 3. Gazette Dispatches for Emergency Advance across eras
	eras := []string{"discovery", "revolt", "independence", "decolonisation", "modern"}
	for _, era := range eras {
		dispatch := GenerateExtraordinaryLevyDispatch(era, "England", "Portsmouth", 250)
		if !strings.Contains(dispatch, "250") {
			t.Errorf("extraordinary levy dispatch missing gold amount for %s: %s", era, dispatch)
		}
		if !strings.Contains(dispatch, "+25% Unrest") {
			t.Errorf("extraordinary levy dispatch missing +25%% Unrest warning for %s: %s", era, dispatch)
		}
	}
}



