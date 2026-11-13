// Dev proxy for `ng serve`: /api -> backend.
// Inside docker compose the backend is reached by its service name (API_PROXY_TARGET=http://backend:8000);
// when you run `ng serve` on your own machine it falls back to localhost.
module.exports = {
  '/api': { target: process.env.API_PROXY_TARGET || 'http://localhost:8000', secure: false },
};
