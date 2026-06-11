const express = require("express");
const router = express.Router();

// Proxies the Country State City API (https://countrystatecity.in) so the
// API key stays server-side and the mobile/web apps avoid CORS issues.
// Get a FREE key at https://countrystatecity.in and set CSC_API_KEY in .env.
const CSC_BASE = "https://api.countrystatecity.in/v1";

// Simple in-memory caches (repopulate on demand after a restart).
let _statesCache = null; // [{ name, iso2 }]
const _citiesByIso = {}; // iso2 -> [cityName]

async function cscGet(path) {
  const key = process.env.CSC_API_KEY;
  if (!key) throw new Error("CSC_API_KEY not set");
  if (typeof fetch !== "function")
    throw new Error("global fetch unavailable (needs Node 18+)");
  const resp = await fetch(`${CSC_BASE}${path}`, {
    headers: { "X-CSCAPI-KEY": key },
  });
  if (!resp.ok) throw new Error(`CSC API responded ${resp.status}`);
  return resp.json();
}

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z]/g, "");

async function ensureStates() {
  if (_statesCache) return _statesCache;
  const data = await cscGet("/countries/IN/states");
  _statesCache = (data || []).map((s) => ({ name: s.name, iso2: s.iso2 }));
  return _statesCache;
}

// GET /api/locations/cities?state=Punjab&search=amri
// Returns up to 30 matching cities for the state. On any failure (no key,
// old Node, network) it returns an empty list with unavailable:true so the
// app can fall back to free-text city entry instead of breaking.
router.get("/cities", async (req, res) => {
  try {
    const stateName = req.query.state || "";
    const search = (req.query.search || "").toLowerCase().trim();
    if (!stateName) return res.json({ success: true, cities: [] });

    const states = await ensureStates();
    const match = states.find((s) => norm(s.name) === norm(stateName));
    if (!match) return res.json({ success: true, cities: [] });

    if (!_citiesByIso[match.iso2]) {
      const data = await cscGet(`/countries/IN/states/${match.iso2}/cities`);
      _citiesByIso[match.iso2] = (data || [])
        .map((c) => c.name)
        .sort((a, b) => a.localeCompare(b));
    }

    let list = _citiesByIso[match.iso2];
    if (search) list = list.filter((n) => n.toLowerCase().includes(search));
    res.json({ success: true, cities: list.slice(0, 30) });
  } catch (e) {
    res.json({
      success: true,
      cities: [],
      unavailable: true,
      message: e.message,
    });
  }
});

module.exports = router;
