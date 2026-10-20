#!/usr/bin/env python3
"""Cache current-season NBA regular-season games for the static Draft Room site.

Source: NBA's public scheduleLeagueV2 JSON. No authentication or Yahoo API.
Raises on network/parse errors so an existing good cache is not overwritten.
"""
import json
import pathlib
import urllib.request
from datetime import datetime, timezone

SOURCE = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json"
DEST = pathlib.Path(__file__).resolve().parents[1] / "nba-schedule.json"


def parse_date(item):
    value = str(item or "").strip()
    if not value:
        raise ValueError("Missing game date")
    for fmt in ("%Y-%m-%d", "%m/%d/%Y %H:%M:%S", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value[:len(datetime.now().strftime(fmt))], fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError(f"Unrecognized game date {value!r}")


def build_schedule(payload):
    league = payload["leagueSchedule"]
    season = str(league.get("seasonYear", ""))
    games = []
    seen = set()
    for day in league.get("gameDates", []):
        for game in day.get("games", []):
            game_id = str(game.get("gameId", ""))
            if not game_id.startswith("002"):  # Regular season only
                continue
            date = parse_date(day.get("gameDate") or game.get("gameDateEst"))
            home = game["homeTeam"]["teamTricode"]
            away = game["awayTeam"]["teamTricode"]
            if not home or not away or home == away:
                raise ValueError(f"Bad teams for {game_id}")
            if game_id in seen:
                continue
            seen.add(game_id)
            games.append({"date": date, "home": home, "away": away, "startUtc": game.get("gameDateTimeUTC") or None})
    if len(games) < 200:
        raise ValueError(f"Only {len(games)} regular-season games found; refusing incomplete schedule.")
    games.sort(key=lambda g: (g["date"], g["home"], g["away"]))
    return {
        "source": SOURCE,
        "season": season,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "games": games,
    }


def fetch_espn_fallback():
    """Build a 2026-27 NBA schedule from ESPN's monthly scoreboards.

    ESPN is a backup when the league CDN blocks automated requests.
    Event dates are converted to Eastern time to avoid a UTC day shift.
    """
    from zoneinfo import ZoneInfo
    games, seen = [], set()
    season_start = 2026
    for month in [10, 11, 12, 1, 2, 3, 4]:
        year = season_start if month >= 10 else season_start + 1
        uri = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={year}{month:02d}&limit=500"
        request = urllib.request.Request(uri, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        with urllib.request.urlopen(request, timeout=40) as response:
            monthly = json.loads(response.read())
        for event in monthly.get("events", []):
            if event.get("season", {}).get("type") != 2:
                continue  # regular season only
            id_ = str(event.get("id", ""))
            if id_ in seen:
                continue
            comps = event.get("competitions", [])
            if not comps:
                continue
            competition = comps[0]
            teams = {
                side.get("homeAway"): side.get("team", {}).get("abbreviation", "")
                for side in competition.get("competitors", [])
            }
            home, away = teams.get("home"), teams.get("away")
            if not home or not away or home == away:
                continue
            when = str(competition.get("date") or event.get("date") or "")
            if not when:
                continue
            parsed = datetime.fromisoformat(when.replace("Z", "+00:00"))
            date = parsed.astimezone(ZoneInfo("America/New_York")).date().isoformat()
            seen.add(id_)
            games.append({"date": date, "home": home, "away": away, "startUtc": parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")})
    if len(games) < 200:
        raise ValueError(f"ESPN monthly schedule incomplete: {len(games)} games")
    games.sort(key=lambda g: (g["date"], g["home"], g["away"]))
    return {
        "source": "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
        "season": "2026-27",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "games": games,
    }


def main():
    try:
        req = urllib.request.Request(
            SOURCE,
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=40) as response:
            raw = response.read()
        data = build_schedule(json.loads(raw))
        print("Loaded official NBA CDN schedule.")
    except Exception as error:
        print(f"NBA CDN failed ({error}); trying ESPN fallback.")
        data = fetch_espn_fallback()
    DEST.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Cached {len(data['games'])} regular-season games from {data['season']} at {DEST}")


if __name__ == "__main__":
    main()
