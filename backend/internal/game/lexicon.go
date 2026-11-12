package game

import (
	"fmt"
	"math"
	"strings"
	"sync"
)

// RealmPort returns a historically flavored primary naval port or commercial capital for the realm.
func RealmPort(code, name string) string {
	switch strings.ToUpper(strings.TrimSpace(code)) {
	case "ENG", "GBR":
		return "Portsmouth"
	case "FRA":
		return "Brest"
	case "SPA", "CAS":
		return "Seville"
	case "POR":
		return "Lisbon"
	case "ARA":
		return "Barcelona"
	case "HAB", "AUT":
		return "Trieste"
	case "SWI", "CHE":
		return "Basel Rhine Terminus"
	case "CZE", "BOH":
		return "Prague Vltava Rail Yard"
	case "HUN":
		return "Budapest Danube Quay"
	case "BOL":
		return "La Paz Rail Depot"
	case "PRY", "PAR":
		return "Asunción River Port"
	case "SRB":
		return "Belgrade Danube Terminal"
	case "LUX":
		return "Luxembourg Rail Crossway"
	case "OTT", "TUR":
		return "Constantinople"
	case "RUS", "USSR":
		return "Archangel"
	case "POL":
		return "Danzig"
	case "PAP", "ITA":
		return "Genoa"
	case "IRL":
		return "Cork"
	case "SWE":
		return "Gothenburg"
	case "NOR":
		return "Bergen"
	case "DNK":
		return "Copenhagen"
	case "NLD":
		return "Amsterdam"
	case "PRU", "GER":
		return "Königsberg"
	case "USA":
		return "Boston"
	case "JPN":
		return "Nagasaki"
	case "CHN":
		return "Canton"
	case "IND":
		return "Calcutta"
	default:
		if name != "" {
			return name + " Port"
		}
		return "Imperial Shipyards"
	}
}

// GenerateColonialMilestoneDispatch produces era-adapted wording for investment progress.
func GenerateColonialMilestoneDispatch(era string, realm, port string, progress float64, estYears float64) string {
	pct := int(math.Round(progress))
	if pct > 100 {
		pct = 100
	}
	yearsStr := fmt.Sprintf("%.1f", estYears)

	switch era {
	case "discovery":
		if progress <= 25.0 {
			return fmt.Sprintf("⚓ %s royal shipwrights lay down the keels of caravels in %s; royal exchequer commits %s years of investment to ocean voyages.", realm, port, yearsStr)
		} else if progress <= 75.0 {
			return fmt.Sprintf("🔨 Naval carpenters in %s fit oak frames and bronze ordnance to %s's exploratory flotilla (%d%% constructed · est. %s yrs to sail).", port, realm, pct, yearsStr)
		}
		return fmt.Sprintf("🌊 Ocean rigging and sea biscuit provisions loaded at %s; %s's exploratory expedition nears final launch readiness (%d%% complete).", port, realm, pct)

	case "revolt":
		if progress <= 25.0 {
			return fmt.Sprintf("⚓ The %s Admiralty and chartered trading syndicate outfit armed Indiamen in %s (%s yrs projected).", realm, port, yearsStr)
		} else if progress <= 75.0 {
			return fmt.Sprintf("🔨 Galleons and frigates fitting copper sheathing and cannons in %s's naval yards (%d%% outfitted · %s yrs remain).", port, pct, yearsStr)
		}
		return fmt.Sprintf("🌊 East India captains assemble navigation charts at %s; %s's transatlantic fleet prepares to weigh anchor (%d%% ready).", port, realm, pct)

	case "independence":
		if progress <= 25.0 {
			return fmt.Sprintf("⚓ %s maritime works lay down iron-hulled steam clippers at %s (%s yrs projected via telegraph).", realm, port, yearsStr)
		} else if progress <= 75.0 {
			return fmt.Sprintf("🔨 Steam turbine assembly and rolled boiler plating underway at %s (%d%% complete · %s yrs remain).", port, pct, yearsStr)
		}
		return fmt.Sprintf("🌊 Sea trials commenced off %s; %s's merchant fleet readies steam pressure for global lines (%d%% ready).", port, realm, pct)

	case "decolonisation":
		if progress <= 25.0 {
			return fmt.Sprintf("⚓ %s merchant marine consortium expands commercial diesel freighters at %s (%s yrs projected).", realm, port, yearsStr)
		} else if progress <= 75.0 {
			return fmt.Sprintf("🔨 Bulk freighter hull welding and marine navigation systems operational at %s (%d%% operational · %s yrs remain).", port, pct, yearsStr)
		}
		return fmt.Sprintf("🌊 Sea trials completed at %s; %s's freighter lines prepare to enter scheduled trade lanes (%d%% ready).", port, realm, pct)

	default: // modern
		if progress <= 25.0 {
			return fmt.Sprintf("⚓ %s logistics conglomerate launches automated container fleet expansion at %s (%s yrs projected).", realm, port, yearsStr)
		} else if progress <= 75.0 {
			return fmt.Sprintf("🔨 Modular container hull fabrication and satellite guidance integrated at %s (%d%% complete · %s yrs remain).", port, pct, yearsStr)
		}
		return fmt.Sprintf("🌊 Automated dock cranes load maiden container stacks at %s; %s's logistics expansion goes live (%d%% operational).", port, realm, pct)
	}
}

// GenerateColonialVoyageReturnDispatch produces celebratory news wording when an expedition completes.
func GenerateColonialVoyageReturnDispatch(era string, realm, port string, yieldPct int, fleetNum int64) string {
	switch era {
	case "discovery":
		return fmt.Sprintf("🎉 HUZZAH! %s's exploratory armada returns to %s laden with clove spices, silk, and gold bullion (+%d%% permanent trade yield · Fleet %d chartered)!", realm, port, yieldPct, fleetNum)
	case "revolt":
		return fmt.Sprintf("🎉 MERCANTILE TRIUMPH! %s's chartered merchantmen anchor in %s with tea, sugar, and porcelain (+%d%% permanent trade yield · Fleet %d commissioned)!", realm, port, yieldPct, fleetNum)
	case "independence":
		return fmt.Sprintf("🎉 IMPERIAL GAZETTE: The %s ensign unfurls across global trade stations; steam merchant fleet inaugurates direct lines to %s (+%d%% trade productivity · Line %d opened)!", realm, port, yieldPct, fleetNum)
	case "decolonisation":
		return fmt.Sprintf("🎉 COMMERCIAL BREAKTHROUGH: %s merchant marine establishes strategic resource corridors linking %s (+%d%% industrial trade yield · Fleet %d deployed)!", realm, port, yieldPct, fleetNum)
	default: // modern
		return fmt.Sprintf("🎉 GLOBAL LOGISTICS EXPANSION: %s automated maritime network fully online at %s, yielding record commercial dividends (+%d%% national GDP boost · Consortium %d active)!", realm, port, yieldPct, fleetNum)
	}
}

// GenerateColonialAbandonmentDispatch produces news wording when investment was slashed and progress decayed to 0.
func GenerateColonialAbandonmentDispatch(era string, realm, port string) string {
	switch era {
	case "discovery":
		return fmt.Sprintf("⚠️ SUNK-COST CATASTROPHE: Drydocks in %s fall silent; unpaid shipwrights strike and unpitched timbers rot in the salt air! Capital investment in %s's armada is completely lost!", port, realm)
	case "revolt":
		return fmt.Sprintf("⚠️ ADMIRALTY CONTRACTS LAPSED: %s treasury cuts halt shipbuilding; unfinished merchant hulls stand abandoned on the %s slipways with total capital write-down!", realm, port)
	case "independence":
		return fmt.Sprintf("⚠️ INDUSTRIAL CREDIT FREEZE: %s dockyard foundries extinguish blast furnaces; unfinished iron hulls rust at %s and capital is forfeited!", realm, port)
	case "decolonisation":
		return fmt.Sprintf("⚠️ FISCAL RETRENCHMENT: %s freighter construction canceled at %s; shipyard contracts liquidated with zero commercial return!", realm, port)
	default: // modern
		return fmt.Sprintf("⚠️ SUPPLY CHAIN CAPEX FORFEITED: %s logistics expansion canceled at %s; uncompleted facilities mothballed and investment written off!", realm, port)
	}
}

// GenerateWealthyMigrationDispatch produces news wording when wealthy merchants arrive or flee.
func GenerateWealthyMigrationDispatch(era string, realm string, goldDelta int64, isArrival bool) string {
	if isArrival {
		switch era {
		case "discovery":
			return fmt.Sprintf("💰 MERCHANTS PROSPER: Genoese spice syndicates and Venetian financiers relocate to %s, depositing %d gold ducats into the Royal Exchequer!", realm, goldDelta)
		case "revolt":
			return fmt.Sprintf("💰 CAPITAL INFLOW: Huguenot artisans and Amsterdam merchant bankers shift capital to %s's free ports (+%d gold reserves)!", realm, goldDelta)
		case "independence":
			return fmt.Sprintf("💰 INDUSTRIAL INVESTMENT: Merchant venturers and railway magnates flock to %s's low-tax jurisdiction (+%d gold reserves)!", realm, goldDelta)
		case "decolonisation":
			return fmt.Sprintf("💰 LIQUIDITY EXPANSION: International trading syndicates and industrial capital establish headquarters in %s (+%d gold)!", realm, goldDelta)
		default: // modern
			return fmt.Sprintf("💰 CAPITAL INJECTION: Venture syndicates and global tech enterprises incorporate in %s, injecting +%d liquid capital reserves!", realm, goldDelta)
		}
	} else {
		drain := int64(math.Abs(float64(goldDelta)))
		switch era {
		case "discovery":
			return fmt.Sprintf("🚨 CAPITAL FLIGHT: Outrageous tithes prompt merchant guilds to flee %s by night, smuggling %d gold ducats across the frontier!", realm, drain)
		case "revolt":
			return fmt.Sprintf("🚨 TAX REVOLT: Punitive customs tariffs drive merchant houses from %s to neutral trading havens (-%d gold reserves)!", realm, drain)
		case "independence":
			return fmt.Sprintf("🚨 EXODUS OF CAPITAL: Confiscatory wealth levies provoke sudden flight of industrial capital from %s (-%d gold reserves)!", realm, drain)
		case "decolonisation":
			return fmt.Sprintf("🚨 EXPROPRIATION FEARS: Severe currency controls drive merchant capital flight from %s (-%d gold reserves)!", realm, drain)
		default: // modern
			return fmt.Sprintf("🚨 CORPORATE EXODUS: Punitive taxes trigger rapid capital flight from %s to offshore havens (-%d liquid reserves)!", realm, drain)
		}
	}
}

// GenerateCivicSafetyDispatch produces dispatches when civic social funds protect the population from famine/pestilence.
func GenerateCivicSafetyDispatch(era, realm, port string) string {
	switch era {
	case "discovery":
		return fmt.Sprintf("🌾 Cathedral tithe granaries in %s open emergency famine stores; winter hunger averted as parish relief sustains peasants across %s.", port, realm)
	case "revolt":
		return fmt.Sprintf("🍞 Municipal grain commissioners in %s fix loaf prices; urban bakers supplied and bread riots quelled in the city faubourgs.", port)
	case "independence":
		return fmt.Sprintf("🏥 Public health boards and clean water aqueducts expand in %s; typhus eradicated and industrial neighborhoods stabilized across %s.", port, realm)
	case "decolonisation":
		return fmt.Sprintf("🏘️ Ministry of Works completes public housing flats in %s; slum clearance delivers health and dignity to working families across %s.", port, realm)
	default: // modern
		return fmt.Sprintf("🛡️ Affordable housing subsidies and child benefit expansions stabilize family budgets; social stability secured across %s.", realm)
	}
}

// GenerateSqualorMortalityDispatch produces dispatches when starvation/pestilence claims citizens due to civic neglect.
func GenerateSqualorMortalityDispatch(era, realm, port string, deaths int64) string {
	switch era {
	case "discovery":
		return fmt.Sprintf("☠️ Granaries stand bare across %s! Cold, famine, and pestilence claim %d peasants as monastic alms houses collapse.", realm, deaths)
	case "revolt":
		return fmt.Sprintf("☠️ Stagnant canals and overflowing tenements in %s spawn cholera; %d citizens perish in miserable squalor across %s.", port, deaths, realm)
	case "independence":
		return fmt.Sprintf("☠️ Unsanitary slums and lack of clean hospital wards claim %d factory laborers; child mortality spikes across %s.", deaths, realm)
	case "decolonisation":
		return fmt.Sprintf("☠️ Healthcare clinic closures and severe nutritional deficits claim %d lives; infant mortality climbs across %s.", deaths, realm)
	default: // modern
		return fmt.Sprintf("☠️ Emergency room closures and social care deficits cause %d preventable deaths; healthcare system reaches crisis breaking point in %s.", deaths, realm)
	}
}

// GenerateHumanCapitalDispatch produces dispatches when sustained social investment yields human capital growth.
func GenerateHumanCapitalDispatch(era, realm, port string, count int64) string {
	switch era {
	case "discovery":
		return fmt.Sprintf("📜 Craft guilds charter %d master carpenters and shipwrights in %s; shipyard output and guild prestige surge across %s!", count, port, realm)
	case "revolt":
		return fmt.Sprintf("🎓 Royal Academy of Sciences and municipal polytechnics founded in %s; engineering advances accelerate commercial manufactories!", port)
	case "independence":
		return fmt.Sprintf("📚 Compulsory Education Act enacted: factory literacy reaches 85%% in %s; machine productivity and rail efficiency surge!", realm)
	case "decolonisation":
		return fmt.Sprintf("🔬 Technical universities and public healthcare expand across %s; skilled labor productivity climbs!", realm)
	default: // modern
		return fmt.Sprintf("💡 High-tech research parks and universal broadband deployment attract premier global engineering talent to %s!", realm)
	}
}

// GenerateInstitutionalDecayDispatch produces dispatches when prolonged civic neglect destroys institutions.
func GenerateInstitutionalDecayDispatch(era, realm, port string) string {
	switch era {
	case "discovery":
		return fmt.Sprintf("📉 Village parish schools and guild workshops decay; rural artisans abandon trades as crown neglected infrastructure crumbles across %s.", realm)
	case "revolt":
		return fmt.Sprintf("📉 Municipal turnpikes rutted and city schools shut down; burghers protest fiscal abandonment across %s.", realm)
	case "independence":
		return fmt.Sprintf("📉 Public school budgets slashed; factory child labor increases as working-class communities descend into Dickensian squalor in %s.", realm)
	case "decolonisation":
		return fmt.Sprintf("📉 Slum expansion and teacher shortages cripple provincial towns; public infrastructure falls into severe disrepair across %s.", realm)
	default: // modern
		return fmt.Sprintf("📉 Housing unaffordability causes birth rates to collapse; top researchers and software engineers emigrate in devastating brain drain from %s.", realm)
	}
}

// GenerateRebellionDispatch produces alarming dispatches when the Unrest Index hits rebellion threshold (U >= 85%).
func GenerateRebellionDispatch(era, realm, port string) string {
	switch era {
	case "discovery":
		return fmt.Sprintf("🚨 PEASANT JACQUERIE: Pitchfork-bearing mobs rise in revolt across %s! A trading market tier is sacked (-200 G value), 15%% treasury looted, and taxes halted!", realm)
	case "revolt":
		return fmt.Sprintf("🚨 STORMING OF THE GATES: Armed urban crowds and radical burghers erect street barricades across %s! Wharves set ablaze and tax collectors routed in %s!", port, realm)
	case "independence":
		return fmt.Sprintf("🚨 INDUSTRIAL GENERAL STRIKE: Rail corridors blocked, coal pits shut down, and factory pickets paralyze %s! Export trade halted in %s!", port, realm)
	case "decolonisation":
		return fmt.Sprintf("🚨 MASS CIVIL DISOBEDIENCE: Nationwide general strike and PAYE tax boycott declared! Government ministries occupied and trade frozen across %s!", realm)
	default: // modern
		return fmt.Sprintf("🚨 SYSTEMIC CIVIC COLLAPSE: Widespread urban protests and tax boycotts paralyze commerce across %s! Sovereign credit rating downgraded in %s!", port, realm)
	}
}

// GenerateCivicOrderRestoredDispatch produces reassuring dispatches when unrest subsides below 60% after a revolt.
func GenerateCivicOrderRestoredDispatch(era, realm, port string) string {
	switch era {
	case "discovery":
		return fmt.Sprintf("🕊️ Crown marshals and parish elders restore order across %s; peasant mobs disperse back to the fields under renewed royal charters.", realm)
	case "revolt":
		return fmt.Sprintf("🕊️ City militias clear the barricades in %s; municipal magistrates re-open trade courts and restore public tranquility across %s.", port, realm)
	case "independence":
		return fmt.Sprintf("🕊️ Conciliation board ratifies social compromise; factory steam sirens sound as workers return peacefully to the mills in %s.", realm)
	case "decolonisation":
		return fmt.Sprintf("🕊️ Civic accord signed between labor unions and the state; tax revenues resume and municipal transport restarts across %s.", realm)
	default: // modern
		return fmt.Sprintf("🕊️ Emergency civic infrastructure package enacted; municipal order and automated trade networks resume normal operations in %s.", realm)
	}
}

// GenerateExtraordinaryLevyDispatch produces news wording when a sovereign demands an early tax advance,
// triggering an immediate cash injection but initiating a 13-month tax drought and popular unrest shock.
func GenerateExtraordinaryLevyDispatch(era, realm, port string, gold int64) string {
	switch era {
	case "discovery":
		return fmt.Sprintf("🚨 EXTRAORDINARY BENEVOLENCE: The Crown demands an early forced tithe across %s (+%d gold reserves)! Shires grumble bitterly (+25%% Unrest) as bailiffs seize grain ahead of winter; no further tax may be collected for 13 months!", realm, gold)
	case "revolt":
		return fmt.Sprintf("🚨 FORCED LOAN DECREE: The King's ministers extract extraordinary war taxes across %s (+%d gold reserves)! Disaffected burghers protest extortion (+25%% Unrest); next year's exchequer stands bare!", port, gold)
	case "independence":
		return fmt.Sprintf("🚨 EMERGENCY WAR LEVY: Parliament enacts an emergency advance assessment across %s (+%d gold)! Factory owners withhold capital investment and labor strikes loom (+25%% Unrest)!", realm, gold)
	case "decolonisation":
		return fmt.Sprintf("🚨 SPECIAL POWERS EMERGENCY TAX: The regime imposes mandatory payroll withholding ahead of schedule across %s (+%d gold)! Trade unions declare national outrage (+25%% Unrest)!", realm, gold)
	default: // modern
		return fmt.Sprintf("🚨 EMERGENCY FISCAL CLAWBACK: Treasury imposes sudden advance tax levies across %s (+%d liquid reserves)! Consumer confidence shatters and credit markets freeze (+25%% Unrest)!", realm, gold)
	}
}

// GetEraKey returns the macroeconomic era key for a given simulation year.
func GetEraKey(simYear float64) string {
	switch {
	case simYear < 1750:
		return "discovery"
	case simYear < 1860:
		return "revolt"
	case simYear < 1920:
		return "independence"
	case simYear < 1989:
		return "decolonisation"
	default:
		return "modern"
	}
}

// EraPricingConfig models configurable expedition cost per % and gestation duration by era.
type EraPricingConfig struct {
	EraKey         string  `json:"era_key"`
	EraID          string  `json:"era_id,omitempty"`
	EraName        string  `json:"era_name"`
	StartYear      float64 `json:"start_year"`
	EndYear        float64 `json:"end_year"`
	CostPerPct     float64 `json:"cost_per_pct"`
	GestationYears float64 `json:"gestation_years"`
	YieldBonus     float64 `json:"yield_bonus"`
}

var (
	eraPricingMu   sync.RWMutex
	eraPricingList = []EraPricingConfig{
		{EraKey: "discovery", EraID: "discovery", EraName: "The Age of Discovery (1500–1749)", StartYear: 1500, EndYear: 1750, CostPerPct: 12.0, GestationYears: 2.0, YieldBonus: 0.05},
		{EraKey: "revolt", EraID: "revolt", EraName: "The Age of Revolt (1750–1859)", StartYear: 1750, EndYear: 1860, CostPerPct: 18.0, GestationYears: 1.5, YieldBonus: 0.05},
		{EraKey: "independence", EraID: "independence", EraName: "The Age of Independence (1860–1919)", StartYear: 1860, EndYear: 1920, CostPerPct: 30.0, GestationYears: 1.0, YieldBonus: 0.06},
		{EraKey: "decolonisation", EraID: "decolonisation", EraName: "The Age of Decolonisation (1920–1988)", StartYear: 1920, EndYear: 1989, CostPerPct: 60.0, GestationYears: 0.5, YieldBonus: 0.08},
		{EraKey: "modern", EraID: "modern", EraName: "The Modern Age (1989+)", StartYear: 1989, EndYear: 9999, CostPerPct: 120.0, GestationYears: 0.35, YieldBonus: 0.10},
	}
)

// GetExpeditionPricingTable returns a thread-safe copy of the configured era pricing table.
func GetExpeditionPricingTable() []EraPricingConfig {
	eraPricingMu.RLock()
	defer eraPricingMu.RUnlock()
	res := make([]EraPricingConfig, len(eraPricingList))
	for i, p := range eraPricingList {
		if p.EraID == "" && p.EraKey != "" {
			p.EraID = p.EraKey
		}
		if p.EraKey == "" && p.EraID != "" {
			p.EraKey = p.EraID
		}
		res[i] = p
	}
	return res
}

// SetExpeditionPricingTable updates the active era expedition pricing parameters in memory.
func SetExpeditionPricingTable(table []EraPricingConfig) {
	eraPricingMu.Lock()
	defer eraPricingMu.Unlock()
	eraPricingList = make([]EraPricingConfig, len(table))
	for i, t := range table {
		if t.EraKey == "" && t.EraID != "" {
			t.EraKey = t.EraID
		}
		if t.EraID == "" && t.EraKey != "" {
			t.EraID = t.EraKey
		}
		eraPricingList[i] = t
	}
}

// GetEraExpeditionPricing returns the pricing config for the era containing simYear.
func GetEraExpeditionPricing(simYear float64) EraPricingConfig {
	eraPricingMu.RLock()
	defer eraPricingMu.RUnlock()
	for _, p := range eraPricingList {
		if simYear >= p.StartYear && simYear < p.EndYear {
			return p
		}
	}
	if len(eraPricingList) > 0 {
		return eraPricingList[len(eraPricingList)-1]
	}
	return EraPricingConfig{EraKey: "discovery", CostPerPct: 12.0, GestationYears: 2.0, YieldBonus: 0.05}
}

// GetEraExpeditionCostPerPct returns the gold/year cost for 1% investment dial in the era.
func GetEraExpeditionCostPerPct(simYear float64) float64 {
	p := GetEraExpeditionPricing(simYear)
	if p.CostPerPct <= 0 {
		return 12.0
	}
	return p.CostPerPct
}

// GetColonialGestationYears returns the gestation duration in years needed to complete an expedition.
func GetColonialGestationYears(simYear float64) float64 {
	p := GetEraExpeditionPricing(simYear)
	if p.GestationYears <= 0 {
		return 2.0
	}
	return p.GestationYears
}

// GetColonialYieldBonus returns the base trade productivity yield bonus for a completed fleet in the era.
func GetColonialYieldBonus(simYear float64) float64 {
	p := GetEraExpeditionPricing(simYear)
	if p.YieldBonus <= 0 {
		return 0.05
	}
	return p.YieldBonus
}

// GetEraExpeditionAnnualCost returns the annual gold expenditure required at 100% investment for the historical era.
// Cost = CostPerPct * 100.
func GetEraExpeditionAnnualCost(simYear float64) float64 {
	return GetEraExpeditionCostPerPct(simYear) * 100.0
}

// GetEraExpeditionTotalCost returns the total gold commitment required to complete an expedition at 100% investment.
func GetEraExpeditionTotalCost(simYear float64) float64 {
	return GetEraExpeditionAnnualCost(simYear) * GetColonialGestationYears(simYear)
}

// IsDeficitAllowed returns true if the historical era permits sovereign deficit financing (Modern Age: 1989+).
func IsDeficitAllowed(simYear float64) bool {
	return simYear >= 1989.0
}

// CheckExpeditionAffordability checks whether a kingdom's treasury reserves can support the declared expedition spending.
// In the Modern Era (1989+), deficit financing and sovereign debt are permitted, so all investments are allowed.
// In pre-modern eras (1500-1988), gold reserves must be adequate to support the multi-year production commitment.
func CheckExpeditionAffordability(resources int64, investment int64, simYear float64) (allowed bool, maxAffordable int64, requiredGold int64, errReason string) {
	if investment <= 0 || IsDeficitAllowed(simYear) {
		return true, 100, 0, ""
	}

	totalCost100 := GetEraExpeditionTotalCost(simYear)
	if totalCost100 <= 0 {
		return true, 100, 0, ""
	}

	maxAffordable = int64(math.Floor((float64(resources) / totalCost100) * 100.0))
	if maxAffordable > 100 {
		maxAffordable = 100
	}
	if maxAffordable < 0 {
		maxAffordable = 0
	}

	requiredGold = int64(math.Ceil(totalCost100 * (float64(investment) / 100.0)))

	if resources < requiredGold {
		annualCost := int64(math.Round(GetEraExpeditionAnnualCost(simYear) * (float64(investment) / 100.0)))
		gestation := GetColonialGestationYears(simYear)
		reason := fmt.Sprintf("Treasury gold reserves (%d ducats) are inadequate to support %d%% expedition spending (%d gold/yr × %.1f yrs = %d gold required). Maximum affordable: %d%%.",
			resources, investment, annualCost, gestation, requiredGold, maxAffordable)
		return false, maxAffordable, requiredGold, reason
	}

	return true, maxAffordable, requiredGold, ""
}


