// Dev proxy for `ng serve`:
//   /api -> Express backend (events)
//   /ai  -> Python AI service (hotspots, iRail); the /ai prefix is stripped
// Inside docker compose the services are reached by name (API_PROXY_TARGET, AI_PROXY_TARGET);
// when you run `ng serve` on your own machine it falls back to localhost.
module.exports = {
  '/api': { target: process.env.API_PROXY_TARGET || 'http://localhost:8000', secure: false },
  '/ai': {
    target: process.env.AI_PROXY_TARGET || 'http://localhost:8001',
    secure: false,
    pathRewrite: { '^/ai': '' },
  },
};
