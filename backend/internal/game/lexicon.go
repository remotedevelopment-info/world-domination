package game

import (
	"fmt"
	"math"
	"strings"
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

// GetColonialGestationYears returns the gestation duration in years needed to complete an expedition at 100% investment.
func GetColonialGestationYears(simYear float64) float64 {
	switch {
	case simYear < 1750:
		return 5.0
	case simYear < 1860:
		return 2.5
	case simYear < 1920:
		return 1.25
	case simYear < 1989:
		return 0.5
	default:
		return 0.35
	}
}

