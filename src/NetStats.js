// Small on-screen connection readout shown during an online match, so lag can
// be diagnosed instead of guessed at. It reports the transport actually in use
// (direct P2P vs. the relay fallback), the round-trip latency, the input delay
// the match negotiated, and how far the simulation is running behind real time
// (the direct measure of stutter). Green when healthy, red when struggling.
function NetStats() {
  this._container = null;
  this._el = null;
}

// A latency reading is "bad" past this, or if the sim falls this far behind.
NetStats.BEHIND_WARN = 4;

NetStats.format = function (stats) {
  var parts = [];
  parts.push(stats.transport);
  parts.push((stats.rtt || 0) + 'ms');
  parts.push('d' + stats.delay);
  if (stats.behind > NetStats.BEHIND_WARN) {
    parts.push('LAG ' + stats.behind);
  }
  return parts.join('  ');
};

NetStats.isHealthy = function (stats) {
  return stats.transport === 'P2P' && stats.behind <= NetStats.BEHIND_WARN;
};

NetStats.prototype.attach = function (container) {
  this._container = document.createElement('div');
  this._container.id = 'net-stats';
  this._container.style.display = 'none';
  this._el = document.createElement('div');
  this._el.className = 'net-stats-text';
  this._container.appendChild(this._el);
  container.appendChild(this._container);
};

NetStats.prototype.show = function () {
  if (this._container) { this._container.style.display = ''; }
};

NetStats.prototype.hide = function () {
  if (this._container) { this._container.style.display = 'none'; }
};

NetStats.prototype.update = function (stats) {
  if (!this._el) { return; }
  this._el.textContent = NetStats.format(stats);
  this._el.className = 'net-stats-text ' + (NetStats.isHealthy(stats) ? 'net-ok' : 'net-warn');
};
