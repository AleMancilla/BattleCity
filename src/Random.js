function Random() {}

// Seeded PRNG (mulberry32). All Random instances share one global state so
// the whole simulation follows a single reproducible sequence. Seeding with
// the same value replays the exact same sequence — this is the foundation
// for deterministic lockstep multiplayer.
Random._state = 1;

Random.setSeed = function (seed) {
  Random._state = seed >>> 0;
};

Random.getNumber = function () {
  Random._state = (Random._state + 0x6D2B79F5) >>> 0;
  var t = Random._state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

Random.prototype.getNumber = function () {
  return Random.getNumber();
};
