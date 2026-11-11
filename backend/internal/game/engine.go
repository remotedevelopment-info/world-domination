package game

import (
	"encoding/json"
	"log"
	"math"
	"sync"
	"time"

	"kingdom-conquest/backend/internal/database"
)

// GameState is the authoritative world snapshot broadcast to clients.
// It is rebuilt on every state mutation and pushed to connected clients in
// real time — there is no 90-second polling tick.
type GameState struct {
	Tick        int64          `json:"tick"`
	SimYear     float64        `json:"sim_year"`
	YearInt     int64          `json:"year_int"`
	EraID       string         `json:"era_id"`
	EraName     string         `json:"era_name"`
	ChronoScale string         `json:"chrono_scale"`
	IsPaused    bool           `json:"is_paused"`
	GameDate    time.Time      `json:"game_date"`
	Timestamp   time.Time      `json:"timestamp"`
	Countries   []CountryState `json:"countries"`
	Players     []PlayerState  `json:"players"`
	Actions     []ActionRecord `json:"actions"`
}

type CountryState struct {
	ID             int64        `json:"id"`
	Name           string       `json:"name"`
	Code           string       `json:"code"`
	Color          string       `json:"color"`
	OwnerID        *int64       `json:"owner_id"`
	OwnerName      *string      `json:"owner_name"` // Username of the player who owns it, if any
	Population     int64        `json:"population"`
	Resources      int64        `json:"resources"`
	Troops         int64        `json:"troops"`
	TroopsLevy     int64        `json:"troops_levy"`
	TroopsRegular  int64        `json:"troops_regular"`
	TroopsElite    int64        `json:"troops_elite"`
	FortN          int64        `json:"fort_n"`
	FortS          int64        `json:"fort_s"`
	FortE          int64        `json:"fort_e"`
	FortW          int64        `json:"fort_w"`
	EconomyRate    int64        `json:"economy_rate"`
	Investment     int64        `json:"investment"`
	SocialCosts    int64        `json:"social_costs"`
	Markets        int64        `json:"markets"`
	Infrastructure int64        `json:"infrastructure"`
	TerritoryType  string       `json:"territory_type"`
	Borders        string       `json:"borders"`
	IsIsland       bool         `json:"is_island"`
	EntrepreneurialPride float64 `json:"entrepreneurial_pride"`
	MilitaryDelayedCosts int64   `json:"military_delayed_costs"`
	ColonialProgress     float64 `json:"colonial_progress"`
	ColonialYield        float64 `json:"colonial_yield"`
	ColonialFleets       int64   `json:"colonial_fleets"`
	Economy        EconomyState `json:"economy"` // Derived dashboard, rebuilt every broadcast
}

type PlayerState struct {
	UserID     int64     `json:"user_id"`
	Username   string    `json:"username"`
	CountryID  int64     `json:"country_id"`
	LastActive time.Time `json:"last_active"`
}

type ActionRecord struct {
	UserID      int64  `json:"user_id"`
	CountryID   int64  `json:"country_id"`
	ActionType  string `json:"action_type"`
	Description string `json:"description"`
}

type GameEngine struct {
	mu                 sync.RWMutex
	currentTick        int64
	subscribers        map[chan GameState]struct{}
	isRunning          bool
	simYear            float64
	chronoScale        string
	isPaused           bool
	lastTimelineUpdate time.Time
	lastInactiveCheck  time.Time
	econDebtYears      float64
}

var engine *GameEngine
var once sync.Once

func GetEngine() *GameEngine {
	once.Do(func() {
		engine = &GameEngine{
			subscribers:        make(map[chan GameState]struct{}),
			simYear:            1500.0,
			chronoScale:        "1d",
			isPaused:           false,
			lastTimelineUpdate: time.Now(),
			lastInactiveCheck:  time.Now(),
		}
	})
	return engine
}

func (g *GameEngine) Start() {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.isRunning {
		return
	}
	g.isRunning = true
	g.lastTimelineUpdate = time.Now()
	log.Println("Game engine started (real-time, event-driven with authoritative timeline)")
}

func (g *GameEngine) Stop() {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.isRunning = false
	log.Println("Game engine stopped")
}

// Resume sets the action-sequence counter, called at startup so ticks stay
// monotonic across restarts (next tick = last persisted snapshot + 1).
func (g *GameEngine) Resume(tick int64) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.currentTick = tick
}

// ResumeState restores tick and timeline state from a persisted snapshot.
func (g *GameEngine) ResumeState(tick int64, simYear float64, chronoScale string, isPaused bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if tick > 0 {
		g.currentTick = tick
	}
	if simYear >= 1500 {
		g.simYear = simYear
	}
	if chronoScale != "" {
		g.chronoScale = NormalizeChronoScale(chronoScale)
	}
	g.isPaused = isPaused
	g.lastTimelineUpdate = time.Now()
}

// SetSimYear explicitly sets the authoritative game year, advances tick,
// and immediately broadcasts the updated world state to all connected clients.
func (g *GameEngine) SetSimYear(year float64) GameState {
	g.mu.Lock()
	prevYearInt := int64(math.Floor(g.simYear))
	newYearInt := int64(math.Floor(year))
	elapsedYears := year - g.simYear
	g.simYear = year
	g.lastTimelineUpdate = time.Now()
	g.currentTick++
	yearRolledOver := newYearInt > prevYearInt
	g.mu.Unlock()

	if yearRolledOver {
		stepYears := elapsedYears
		if stepYears <= 0 {
			stepYears = 1.0
		} else if stepYears > 10.0 {
			stepYears = 10.0 // clamp single jump calculation to max 10 years to prevent numeric overflow
		}
		g.TickEconomyStep(stepYears, true)
	}

	state := g.BuildState()
	if err := database.SaveGameState(time.Now(), state.JSON()); err != nil {
		log.Printf("Error saving game state snapshot on year set: %v", err)
	}
	g.Notify(state)
	return state
}

// SetChronoScale updates the real-time speed of the global game clock.
func (g *GameEngine) SetChronoScale(scale string) GameState {
	normScale := NormalizeChronoScale(scale)
	g.mu.Lock()
	g.chronoScale = normScale
	g.lastTimelineUpdate = time.Now()
	g.mu.Unlock()

	state := g.BuildState()
	g.Notify(state)
	return state
}

// SetTimelinePaused pauses or resumes the auto-advancement of the game clock.
func (g *GameEngine) SetTimelinePaused(paused bool) GameState {
	g.mu.Lock()
	g.isPaused = paused
	g.lastTimelineUpdate = time.Now()
	g.mu.Unlock()

	state := g.BuildState()
	g.Notify(state)
	return state
}

// ResetToYear1500 executes a full reset to the Year 1500 base date, restoring
// all players and territories to initial baseline values and broadcasting
// the clean state to all connected clients.
func (g *GameEngine) ResetToYear1500(clearClaims bool) (GameState, error) {
	if database.DB != nil {
		if err := database.ResetGameToYear1500(clearClaims); err != nil {
			return GameState{}, err
		}
	}

	g.mu.Lock()
	g.simYear = 1500.0
	g.chronoScale = "1d"
	g.isPaused = false
	g.econDebtYears = 0
	g.lastTimelineUpdate = time.Now()
	g.currentTick++
	g.mu.Unlock()

	state := g.BuildState()
	if database.DB != nil {
		if err := database.SaveGameState(time.Now(), state.JSON()); err != nil {
			log.Printf("Error saving game state snapshot on reset: %v", err)
		}
	}
	g.Notify(state)
	return state, nil
}

// GetTimeline returns current authoritative timeline parameters.
func (g *GameEngine) GetTimeline() (float64, int64, Era, string, bool) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	yearInt := int64(math.Floor(g.simYear))
	return g.simYear, yearInt, GetEraForYear(yearInt), g.chronoScale, g.isPaused
}

func (g *GameEngine) GetSimYear() float64 {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.simYear
}

func (g *GameEngine) GetCurrentEra() Era {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return GetEraForYear(int64(math.Floor(g.simYear)))
}

func (g *GameEngine) GetChronoScale() string {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.chronoScale
}

func (g *GameEngine) IsPaused() bool {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.isPaused
}

// TickTimeline advances the continuous timeline based on elapsed real-world time
// and the current ChronoScale. When time passes (especially under accelerated ChronoScales
// such as 1s = 1 yr or 5s = 1 yr), economic expenses (troop upkeep, taxes, social costs,
// investments), market trade revenues/risk, and wartime continuous conscription are
// simulated in proportion to elapsed time and broadcast live to all clients.
func (g *GameEngine) TickTimeline() bool {
	g.mu.Lock()
	if !g.isRunning || g.isPaused {
		g.lastTimelineUpdate = time.Now()
		g.mu.Unlock()
		return false
	}
	now := time.Now()
	elapsed := now.Sub(g.lastTimelineUpdate).Seconds()
	g.lastTimelineUpdate = now

	scaleSec, ok := ChronoScales[g.chronoScale]
	if !ok || scaleSec <= 0 {
		scaleSec = 86400.0
	}

	deltaYears := elapsed / scaleSec
	prevYearInt := int64(math.Floor(g.simYear))
	prevEra := GetEraForYear(prevYearInt)

	g.simYear += deltaYears
	newYearInt := int64(math.Floor(g.simYear))
	newEra := GetEraForYear(newYearInt)

	g.econDebtYears += deltaYears
	var stepYears float64
	yearRolledOver := newYearInt > prevYearInt
	if g.econDebtYears >= 0.05 || yearRolledOver {
		stepYears = g.econDebtYears
		if stepYears <= 0 && yearRolledOver {
			stepYears = deltaYears
		}
		g.econDebtYears = 0
	}
	g.mu.Unlock()

	econChanged := false
	if stepYears > 0 || yearRolledOver {
		econChanged = g.TickEconomyStep(stepYears, yearRolledOver)
	}

	if (newYearInt != prevYearInt || newEra.ID != prevEra.ID) && !econChanged {
		state := g.BuildState()
		g.Notify(state)
		return true
	}
	return econChanged || newYearInt != prevYearInt || newEra.ID != prevEra.ID
}

// Advance performs one world mutation: it advances the action sequence
// counter, rebuilds the authoritative state from PostgreSQL, persists a
// snapshot, and immediately pushes it to every connected client. Callers
// invoke it after any mutation that changes the world.
func (g *GameEngine) Advance() GameState {
	g.mu.Lock()
	g.currentTick++
	shouldCheckInactive := time.Since(g.lastInactiveCheck) > 10*time.Minute
	if shouldCheckInactive {
		g.lastInactiveCheck = time.Now()
	}
	g.mu.Unlock()

	state := g.BuildState()
	if err := database.SaveGameState(time.Now(), state.JSON()); err != nil {
		log.Printf("Error saving game state snapshot: %v", err)
	}

	if shouldCheckInactive && g.ProcessInactivePlayers() {
		state = g.BuildState()
	}
	g.Notify(state)
	return state
}

// TickEconomyStep simulates elapsed game time for every owned kingdom:
// 1. Budget Balance: tax revenues minus standing army upkeep, social costs, and investment.
// 2. Markets: direct commercial trade revenue plus dynamic market risk/volatility (boom vs. slump/piracy).
// 3. Warfare & Continuous Conscription: active wars cause frontline combat attrition/casualties;
//    kingdoms with funds automatically levy continuous conscription from the civilian population,
//    draining treasury and reducing the civilian workforce; bankrupt kingdoms suffer desertion.
// 4. Population growth: prosperity and infrastructure drive population growth.
func (g *GameEngine) TickEconomyStep(yearsPassed float64, yearRolledOver bool) bool {
	if yearsPassed <= 0 && !yearRolledOver {
		return false
	}
	countries, err := database.GetCountries("medieval")
	if err != nil {
		log.Printf("Error getting countries for economy step: %v", err)
		return false
	}
	activeWars, err := database.GetActiveWars()
	if err != nil {
		log.Printf("Error querying active wars: %v", err)
		activeWars = make(map[int64]bool)
	}

	g.mu.RLock()
	simYear := g.simYear
	g.mu.RUnlock()

	changed := false
	for _, c := range countries {
		if c.OwnerID == nil {
			continue // unclaimed kingdoms stagnate
		}

		econ := ComputeEconomyFull(
			c.Population, c.Resources, c.Troops,
			c.EconomyRate, c.Markets, c.Infrastructure, c.Investment, c.SocialCosts,
			c.TroopsLevy, c.TroopsRegular, c.TroopsElite,
			c.EntrepreneurialPride, c.MilitaryDelayedCosts, c.ColonialYield, simYear,
		)

		// 1. Markets: Income and Risk (compounded by completed colonial fleet trade yield)
		var baseMarket, riskSwing float64
		if c.Markets > 0 {
			baseMarket, riskSwing = MarketIncomeAndRisk(c.Markets, simYear, c.ID)
			if c.ColonialYield > 0 {
				baseMarket *= (1.0 + c.ColonialYield)
			}
		} else if c.ColonialYield > 0 {
			baseMarket = c.ColonialYield * 250.0
		}
		annualMarketActual := int64(math.Round(baseMarket + riskSwing))
		if annualMarketActual < 0 {
			annualMarketActual = 0
		}
		annualTotalRev := econ.TaxRevenue + annualMarketActual

		// 2. Fiscal Discipline & Budget Execution (Layer 1 Hard-Specie Regime):
		// As long as the treasury holds specie reserves (c.Resources > 0), planned spending
		// can proceed and draws down gold reserves when in deficit.
		// Once gold reserves are exhausted (c.Resources <= 0), no sovereign debt/loans exist in Era 1,
		// so expenditures are strictly capped to annual revenue.
		var effMilAnnual, effSocAnnual, effInvAnnual int64
		var effTotalExpAnnual, effBalanceAnnual int64

		if c.Resources > 0 {
			effMilAnnual = econ.MilitaryUpkeep
			effSocAnnual = econ.SocialExpenditure
			effInvAnnual = econ.InvestmentExpenditure
			effTotalExpAnnual = effMilAnnual + effSocAnnual + effInvAnnual
			effBalanceAnnual = annualTotalRev - effTotalExpAnnual
		} else {
			effMilAnnual, effSocAnnual, effInvAnnual, _ = EnforceBalancedBudget(
				annualTotalRev,
				econ.MilitaryUpkeep,
				econ.SocialExpenditure,
				econ.InvestmentExpenditure,
			)
			effTotalExpAnnual = effMilAnnual + effSocAnnual + effInvAnnual
			effBalanceAnnual = annualTotalRev - effTotalExpAnnual
		}

		// Net treasury balance delta (drain on deficit, expand on surplus)
		periodDelta := int64(math.Round(float64(effBalanceAnnual) * yearsPassed))
		newResources := c.Resources + periodDelta
		if newResources < 0 {
			newResources = 0
		}

		// 3. Population Growth & Tax-Driven Migration
		newPopulation := c.Population
		popGrowth := int64(math.Round(float64(PopulationGrowth(c.Population, c.EconomyRate, c.Markets, c.Infrastructure, c.Investment, c.SocialCosts)) * yearsPassed))
		migrationDelta := int64(math.Round(float64(econ.NetMigration) * yearsPassed))
		newPopulation += popGrowth + migrationDelta

		// Frontier land abundance attractor: severely depopulated realms draw homesteaders to vacant arable land
		if newPopulation < 100000 && yearsPassed > 0 {
			homesteaders := int64(math.Round(float64(100000-newPopulation) * 0.05 * yearsPassed))
			if homesteaders > 0 {
				newPopulation += homesteaders
			}
		}

		// Wealthy Capital Transfer: incoming wealthy inject specie, fleeing wealthy drain specie
		if econ.CapitalFlightDrain != 0 && yearsPassed > 0 {
			capDelta := int64(math.Round(float64(econ.CapitalFlightDrain) * yearsPassed))
			newResources += capDelta
			if newResources < 0 {
				newResources = 0
			}
		}

		// 4. Warfare, Multi-Layered Troops, Continuous Conscription & Demobilization
		newTroops := c.Troops
		newLevy := c.TroopsLevy
		newRegular := c.TroopsRegular
		newElite := c.TroopsElite
		if newTroops > 0 && (newLevy+newRegular+newElite) == 0 {
			newRegular = newTroops
		}

		// Helper to expend casualties/demobilizations across layers (Levies first, then Regulars, then Elites)
		expendCasualties := func(loss int64) {
			if loss <= 0 {
				return
			}
			if loss <= newLevy {
				newLevy -= loss
				return
			}
			loss -= newLevy
			newLevy = 0
			if loss <= newRegular {
				newRegular -= loss
				return
			}
			loss -= newRegular
			newRegular = 0
			newElite -= loss
			if newElite < 0 {
				newElite = 0
			}
		}

		// If treasury is exhausted (c.Resources <= 0 or newResources == 0) and military upkeep exceeds revenue,
		// the crown has no gold to pay its soldiers. Unpaid troops demobilize/desert!
		if (c.Resources <= 0 || newResources <= 0) && econ.MilitaryUpkeep > annualTotalRev && newTroops > 0 {
			unfundedUpkeep := float64(econ.MilitaryUpkeep - annualTotalRev)
			demobilized := int64(math.Ceil((unfundedUpkeep / 6.0) * 0.5 * yearsPassed))
			if demobilized < 1 && yearsPassed > 0 {
				demobilized = 1
			}
			if demobilized > newTroops {
				demobilized = newTroops
			}
			expendCasualties(demobilized)
			newTroops = newLevy + newRegular + newElite
		}

		isAtWar := activeWars[c.ID]
		if isAtWar {
			// Combat attrition / casualties on front lines (~8% annually)
			casualtyRate := 0.08
			casualties := int64(math.Ceil(float64(newTroops) * casualtyRate * yearsPassed))
			if casualties > newTroops {
				casualties = newTroops
			}

			// Wars expend soldiers: raw levies break and take the brunt first, preserving veterans longest
			expendCasualties(casualties)
			newTroops = newLevy + newRegular + newElite

			// Continuous conscription to replace casualties and maintain troop readiness
			conscriptNeeded := casualties
			if newTroops < 200 && newPopulation > 250 {
				conscriptNeeded += int64(math.Ceil(4.0 * yearsPassed))
			}

			draftCost := conscriptNeeded * 15 // arms, uniforms, bounty per levy recruit
			if newResources >= draftCost && newPopulation > (conscriptNeeded+50) {
				// Kingdom can fund conscription from existing specie without deficit:
				newResources -= draftCost
				newPopulation -= conscriptNeeded
				newLevy += conscriptNeeded
				newTroops = newLevy + newRegular + newElite
			} else {
				// Cannot fund conscription without deficit: troops suffer casualties + desertion
				desertions := int64(math.Ceil(float64(newTroops) * 0.05 * yearsPassed))
				expendCasualties(desertions)
				newTroops = newLevy + newRegular + newElite
			}
		}

		// Bound values (Layer 1: strictly no negative treasury deficit)
		if newResources < 0 {
			newResources = 0
		}
		// A realm's civilian population must be viable and support its standing army (minimum 10,000 civilians)
		minPop := int64(math.Max(10000.0, float64(newTroops)*2.0))
		if newPopulation < minPop {
			newPopulation = minPop
		}
		if newLevy < 0 {
			newLevy = 0
		}
		if newRegular < 0 {
			newRegular = 0
		}
		if newElite < 0 {
			newElite = 0
		}
		newTroops = newLevy + newRegular + newElite

		// 5. Dynamic Evolution of Hidden Internal States (Pride & Delayed Military Costs)
		newPride := c.EntrepreneurialPride
		if newPride <= 0 {
			newPride = 100.0 // default initialize
		}
		if c.EconomyRate > 40 {
			// High taxation erodes entrepreneurial pride & risk appetite
			loss := float64(c.EconomyRate-40) * 0.40 * yearsPassed
			newPride -= loss
		} else if c.EconomyRate <= 35 && c.Resources > 0 {
			// Fair taxation and solvent treasury gradually restores merchant confidence (+2.0/yr)
			newPride += 2.0 * yearsPassed
		}
		if newPride < 5.0 {
			newPride = 5.0
		}
		if newPride > 100.0 {
			newPride = 100.0
		}
		newPride = math.Round(newPride*10) / 10

		// Delayed military commitments decay by 20% annually (half-life ~3.1 years)
		newDelayedCosts := c.MilitaryDelayedCosts
		if newDelayedCosts > 0 {
			newDelayedCosts = int64(math.Round(float64(newDelayedCosts) * math.Pow(0.80, yearsPassed)))
		}

		// 6. Colonial Expedition Gestation & Sunk-Cost Pipeline:
		// Multi-year construction gestation with sunk-cost decay (-25%/yr) upon defunding.
		gestationPeriod := GetColonialGestationYears(simYear)
		eraKey := GetEraKey(simYear)
		portName := RealmPort(c.Code, c.Name)
		var ownerID int64
		if c.OwnerID != nil {
			ownerID = *c.OwnerID
		}

		newProgress := c.ColonialProgress
		newYield := c.ColonialYield
		newFleets := c.ColonialFleets

		effInvestmentRate := float64(c.Investment)
		if econ.InvestmentExpenditure > 0 {
			effInvestmentRate *= (float64(effInvAnnual) / float64(econ.InvestmentExpenditure))
		} else if c.Investment > 0 && c.Resources <= 0 {
			effInvestmentRate = 0.0
		}

		if effInvestmentRate > 0 {
			progressGain := yearsPassed * (effInvestmentRate / 100.0) * (100.0 / gestationPeriod)
			prevProgress := newProgress
			newProgress += progressGain

			// Announce milestone dispatches (first keel laid, 50% framed, 75% sea trials)
			if (prevProgress == 0.0 && newProgress > 0.0) ||
				(prevProgress < 50.0 && newProgress >= 50.0) ||
				(prevProgress < 75.0 && newProgress >= 75.0) {
				estYearsRemaining := math.Max(0.0, (100.0-newProgress)/(effInvestmentRate/gestationPeriod))
				newsMsg := GenerateColonialMilestoneDispatch(eraKey, c.Name, portName, newProgress, estYearsRemaining)
				_ = database.LogAction(ownerID, c.ID, "news", newsMsg, nil, "", "", "")
			}

			// Expedition voyage completion: charter fleet and grant permanent trade yield bonus
			if newProgress >= 100.0 {
				newFleets++
				newProgress = 0.0
				newYield += 0.05
				newYield = math.Round(newYield*100) / 100
				yieldPct := int(math.Round(newYield * 100.0))
				newsMsg := GenerateColonialVoyageReturnDispatch(eraKey, c.Name, portName, yieldPct, newFleets)
				_ = database.LogAction(ownerID, c.ID, "news", newsMsg, nil, "", "", "")
			}
		} else if newProgress > 0 {
			// Sunk-cost rot & decay: unmaintained shipyards decay at -25% per annum
			decay := 25.0 * yearsPassed
			prevProgress := newProgress
			newProgress -= decay
			if newProgress <= 0.0 {
				newProgress = 0.0
				if prevProgress > 5.0 {
					newsMsg := GenerateColonialAbandonmentDispatch(eraKey, c.Name, portName)
					_ = database.LogAction(ownerID, c.ID, "news", newsMsg, nil, "", "", "")
				}
			}
		}
		newProgress = math.Round(newProgress*10) / 10

		// Wealthy Merchant Capital Migration News Dispatch on Year Rollover
		if yearRolledOver && econ.CapitalFlightDrain != 0 {
			if math.Abs(float64(econ.CapitalFlightDrain)) >= 100 {
				isArrival := econ.CapitalFlightDrain > 0
				msg := GenerateWealthyMigrationDispatch(eraKey, c.Name, econ.CapitalFlightDrain, isArrival)
				_ = database.LogAction(ownerID, c.ID, "news", msg, nil, "", "", "")
			}
		}

		if yearRolledOver {
			// A calendar year has officially turned over: commit the completed year's actuals
			// into the historical Last Year ledger, rolling over previous actuals.
			if err := database.UpdateCountryVitalsBudgetAndTroopLayers(
				c.ID, newPopulation, newResources, newTroops, newLevy, newRegular, newElite,
				econ.TaxRevenue, annualMarketActual, effMilAnnual, effSocAnnual, effInvAnnual,
				effTotalExpAnnual, effBalanceAnnual, econ.NetMigration,
				newPride, newDelayedCosts,
				newProgress, newYield, newFleets,
			); err != nil {
				log.Printf("Error committing annual budget rollover for country %d: %v", c.ID, err)
				continue
			}
			changed = true
			c.EntrepreneurialPride = newPride
			c.MilitaryDelayedCosts = newDelayedCosts
			c.ColonialProgress = newProgress
			c.ColonialYield = newYield
			c.ColonialFleets = newFleets
		} else if newResources != c.Resources || newPopulation != c.Population || newTroops != c.Troops ||
			newLevy != c.TroopsLevy || newRegular != c.TroopsRegular || newElite != c.TroopsElite ||
			newPride != c.EntrepreneurialPride || newDelayedCosts != c.MilitaryDelayedCosts ||
			newProgress != c.ColonialProgress || newYield != c.ColonialYield || newFleets != c.ColonialFleets {
			// Intra-year incremental tick: update dynamic vitals without overwriting Last Year's budget ledger
			if err := database.UpdateCountryVitalsAndTroopLayers(
				c.ID, newPopulation, newResources, newTroops, newLevy, newRegular, newElite,
				newPride, newDelayedCosts,
				newProgress, newYield, newFleets,
			); err != nil {
				log.Printf("Error updating intra-year vitals for country %d: %v", c.ID, err)
				continue
			}
			changed = true
			c.EntrepreneurialPride = newPride
			c.MilitaryDelayedCosts = newDelayedCosts
			c.ColonialProgress = newProgress
			c.ColonialYield = newYield
			c.ColonialFleets = newFleets
		}
	}

	if changed {
		g.Advance()
	}
	return changed
}

// TickEconomy flushes pending economy simulation or applies a baseline pulse
// during slower ChronoScales (e.g. 1d = 1 yr).
func (g *GameEngine) TickEconomy() {
	g.mu.Lock()
	if g.isPaused || !g.isRunning {
		g.mu.Unlock()
		return
	}
	step := g.econDebtYears
	g.econDebtYears = 0
	g.mu.Unlock()

	if step < 0.01 {
		step = 0.01
	}
	g.TickEconomyStep(step, false)
}

// BuildState rebuilds the canonical world from PostgreSQL. It is called by
// Advance after every mutation and can also be called on demand.
func (g *GameEngine) BuildState() GameState {
	countries, err := database.GetCountries("medieval")
	if err != nil {
		log.Printf("Error getting countries: %v", err)
	}

	g.mu.RLock()
	simYear := g.simYear
	g.mu.RUnlock()

	var countryStates []CountryState
	for _, c := range countries {
		econ := ComputeEconomyFull(
			c.Population, c.Resources, c.Troops,
			c.EconomyRate, c.Markets, c.Infrastructure, c.Investment, c.SocialCosts,
			c.TroopsLevy, c.TroopsRegular, c.TroopsElite,
			c.EntrepreneurialPride, c.MilitaryDelayedCosts, c.ColonialYield, simYear,
		)
		PopulateLastYearLedger(
			&econ,
			c.LastTaxRevenue, c.LastMarketIncome, c.LastMilitaryExp,
			c.LastSocialExp, c.LastInvestmentExp, c.LastTotalExp,
			c.LastBudgetBalance, c.LastMigration,
		)
		cs := CountryState{
			ID:                   c.ID,
			Name:                 c.Name,
			Code:                 c.Code,
			Color:                c.Color,
			Population:           c.Population,
			Resources:            c.Resources,
			Troops:               c.Troops,
			TroopsLevy:           c.TroopsLevy,
			TroopsRegular:        c.TroopsRegular,
			TroopsElite:          c.TroopsElite,
			FortN:                c.FortN,
			FortS:                c.FortS,
			FortE:                c.FortE,
			FortW:                c.FortW,
			EconomyRate:          c.EconomyRate,
			Investment:           c.Investment,
			SocialCosts:          c.SocialCosts,
			Markets:              c.Markets,
			Infrastructure:       c.Infrastructure,
			TerritoryType:        c.TerritoryType,
			Borders:              c.Borders,
			IsIsland:             c.IsIsland,
			EntrepreneurialPride: c.EntrepreneurialPride,
			MilitaryDelayedCosts: c.MilitaryDelayedCosts,
			ColonialProgress:     c.ColonialProgress,
			ColonialYield:        c.ColonialYield,
			ColonialFleets:       c.ColonialFleets,
			Economy:              econ,
		}
		if c.OwnerID != nil {
			cs.OwnerID = c.OwnerID
		}
		if c.OwnerName != nil {
			cs.OwnerName = c.OwnerName
		}
		countryStates = append(countryStates, cs)
	}

	players, err := database.GetActivePlayers()
	if err != nil {
		log.Printf("Error getting active players: %v", err)
	}
	var playerStates []PlayerState
	for _, p := range players {
		playerStates = append(playerStates, PlayerState{
			UserID:     p.UserID,
			Username:   p.Username,
			CountryID:  p.CountryID,
			LastActive: p.LastActive,
		})
	}

	actions, err := database.GetRecentActions(20)
	if err != nil {
		log.Printf("Error getting recent actions: %v", err)
	}
	var actionRecords []ActionRecord
	for _, a := range actions {
		actionRecords = append(actionRecords, ActionRecord{
			UserID:      a.UserID,
			CountryID:   a.CountryID,
			ActionType:  a.ActionType,
			Description: a.Description,
		})
	}

	g.mu.RLock()
	tick := g.currentTick
	simYear = g.simYear
	chronoScale := g.chronoScale
	isPaused := g.isPaused
	g.mu.RUnlock()

	yearInt := int64(math.Floor(simYear))
	era := GetEraForYear(yearInt)

	return GameState{
		Tick:        tick,
		SimYear:     simYear,
		YearInt:     yearInt,
		EraID:       era.ID,
		EraName:     era.Name,
		ChronoScale: chronoScale,
		IsPaused:    isPaused,
		GameDate:    time.Now(),
		Timestamp:   time.Now(),
		Countries:   countryStates,
		Players:     playerStates,
		Actions:     actionRecords,
	}
}

// ProcessInactivePlayers enforces the daily-activity rule: any player who
// has not been active (heartbeat/ping) in over 7 days loses their kingdom.
// It returns true if the world changed, signalling the caller must
// rebuild and re-broadcast the state.
func (g *GameEngine) ProcessInactivePlayers() bool {
	cutoff := time.Now().Add(-7 * 24 * time.Hour)
	rows, err := database.GetStalePlayers(cutoff)
	if err != nil {
		log.Printf("Error checking inactive players: %v", err)
		return false
	}
	changed := false
	for _, p := range rows {
		if err := database.SetCountryOwnerToNull(p.CountryID); err != nil {
			log.Printf("Error nulling owner for country %d: %v", p.CountryID, err)
			continue
		}
		if err := database.MarkPlayerCountryInactive(p.UserID, p.CountryID); err != nil {
			log.Printf("Error marking inactive for user %d: %v", p.UserID, err)
			continue
		}
		log.Printf("Player %s lost %s after 7 days of inactivity", p.Username, p.CountryCode)
		changed = true
	}
	return changed
}

// Notify pushes a freshly built state to every connected client.
func (g *GameEngine) Notify(state GameState) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	for ch := range g.subscribers {
		select {
		case ch <- state:
		default:
		}
	}
}

func (g *GameEngine) Subscribe() chan GameState {
	ch := make(chan GameState, 10)
	g.mu.Lock()
	g.subscribers[ch] = struct{}{}
	g.mu.Unlock()
	return ch
}

func (g *GameEngine) Unsubscribe(ch chan GameState) {
	g.mu.Lock()
	delete(g.subscribers, ch)
	close(ch)
	g.mu.Unlock()
}

func (g *GameEngine) GetCurrentTick() int64 {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.currentTick
}

func (s GameState) JSON() string {
	b, err := json.Marshal(s)
	if err != nil {
		return "{}"
	}
	return string(b)
}
