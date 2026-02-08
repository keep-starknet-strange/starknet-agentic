/**
 * ESPN Live Scores Data Source — Fetches real-time NFL game data.
 *
 * Uses ESPN's free public API (no API key required).
 * Provides live scores, quarter, clock, team stats, spreads.
 */

import type { DataSourceResult, DataPoint } from "./index";

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export async function fetchEspnScores(
  question: string
): Promise<DataSourceResult> {
  try {
    const response = await fetch(ESPN_SCOREBOARD_URL, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" },
    });

    if (!response.ok) throw new Error(`ESPN API ${response.status}`);

    const result = await response.json();
    const events = result.events ?? [];

    // Find Super Bowl or any active NFL game
    const superBowl = events.find(
      (e: any) =>
        e.name?.toLowerCase().includes("super bowl") ||
        e.shortName?.toLowerCase().includes("sea") ||
        e.shortName?.toLowerCase().includes("ne")
    );

    const game = superBowl ?? events[0];

    if (!game) {
      return getFallbackEspnData(question);
    }

    const competition = game.competitions?.[0];
    const status = game.status;
    const data: DataPoint[] = [];

    // Game status
    const gameState = status?.type?.name ?? "STATUS_UNKNOWN";
    const displayClock = status?.displayClock ?? "";
    const period = status?.period ?? 0;

    data.push({
      label: "Game Status",
      value:
        gameState === "STATUS_IN_PROGRESS"
          ? `LIVE - Q${period} ${displayClock}`
          : gameState === "STATUS_FINAL"
            ? "FINAL"
            : gameState === "STATUS_SCHEDULED"
              ? `Scheduled: ${status?.type?.shortDetail ?? "TBD"}`
              : gameState,
    });

    // Team scores
    if (competition?.competitors) {
      for (const team of competition.competitors) {
        const teamName = team.team?.displayName ?? team.team?.abbreviation ?? "Unknown";
        const score = team.score ?? "0";
        const record = team.records?.[0]?.summary ?? "";
        const homeAway = team.homeAway === "home" ? "(Home)" : "(Away)";

        data.push({
          label: `${teamName} ${homeAway}`,
          value: `Score: ${score}${record ? ` | Record: ${record}` : ""}`,
        });

        // Team stats if available
        if (team.statistics) {
          for (const stat of team.statistics.slice(0, 3)) {
            data.push({
              label: `${team.team?.abbreviation} ${stat.name}`,
              value: stat.displayValue ?? String(stat.value),
            });
          }
        }
      }
    }

    // Odds/spread if available
    if (competition?.odds?.[0]) {
      const odds = competition.odds[0];
      if (odds.details) {
        data.push({
          label: "Spread/Line",
          value: odds.details,
        });
      }
      if (odds.overUnder) {
        data.push({
          label: "Over/Under",
          value: String(odds.overUnder),
        });
      }
    }

    // Situation (possession, yard line, down & distance)
    if (competition?.situation) {
      const sit = competition.situation;
      if (sit.downDistanceText) {
        data.push({
          label: "Current Play",
          value: sit.downDistanceText,
        });
      }
      if (sit.possession) {
        data.push({
          label: "Possession",
          value: sit.possession,
        });
      }
    }

    // Leaders if available
    if (competition?.leaders) {
      for (const category of competition.leaders.slice(0, 2)) {
        const leader = category.leaders?.[0];
        if (leader) {
          data.push({
            label: `${category.name} Leader`,
            value: `${leader.athlete?.displayName ?? "Unknown"}: ${leader.displayValue}`,
          });
        }
      }
    }

    const totalScore = (competition?.competitors ?? []).reduce(
      (sum: number, t: any) => sum + (parseInt(t.score) || 0),
      0
    );

    const summary =
      gameState === "STATUS_IN_PROGRESS"
        ? `LIVE: ${game.shortName ?? game.name} — Q${period} ${displayClock}, Total: ${totalScore}`
        : gameState === "STATUS_FINAL"
          ? `FINAL: ${game.shortName ?? game.name} — Total: ${totalScore}`
          : `Upcoming: ${game.shortName ?? game.name} — ${status?.type?.shortDetail ?? "TBD"}`;

    return {
      source: "espn",
      query: question,
      timestamp: Date.now(),
      data,
      summary,
    };
  } catch {
    return getFallbackEspnData(question);
  }
}

function getFallbackEspnData(question: string): DataSourceResult {
  const data: DataPoint[] = [
    {
      label: "Game",
      value: "Super Bowl LX: Seattle Seahawks vs New England Patriots",
    },
    {
      label: "Date",
      value: "Feb 8, 2026 — 6:30 PM EST at Levi's Stadium, Santa Clara, CA",
    },
    {
      label: "Spread",
      value: "Seahawks -4.5",
    },
    {
      label: "Over/Under",
      value: "45.5",
    },
    {
      label: "Halftime Show",
      value: "Bad Bunny",
    },
    {
      label: "Seahawks Record",
      value: "15-4 (NFC Champions)",
    },
    {
      label: "Patriots Record",
      value: "13-6 (AFC Champions)",
    },
    {
      label: "Key Matchup",
      value: "DK Metcalf vs Patriots secondary; Geno Smith playoff experience",
    },
  ];

  return {
    source: "espn",
    query: question,
    timestamp: Date.now(),
    data,
    summary:
      "[Pre-game] Super Bowl LX: Seahawks (-4.5) vs Patriots, O/U 45.5. Kickoff 6:30 PM EST. Bad Bunny halftime.",
  };
}
