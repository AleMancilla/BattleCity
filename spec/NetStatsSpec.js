describe("NetStats", function () {
  it("formats a healthy P2P line", function () {
    expect(NetStats.format({ transport: 'P2P', rtt: 42, delay: 5, behind: 0 }))
      .toEqual('P2P  42ms  d5');
  });

  it("formats a relay line", function () {
    expect(NetStats.format({ transport: 'RELAY', rtt: 130, delay: 8, behind: 1 }))
      .toEqual('RELAY  130ms  d8');
  });

  it("shows a LAG marker when the sim falls behind", function () {
    expect(NetStats.format({ transport: 'P2P', rtt: 90, delay: 6, behind: 12 }))
      .toEqual('P2P  90ms  d6  LAG 12');
  });

  it("treats P2P with little lag as healthy", function () {
    expect(NetStats.isHealthy({ transport: 'P2P', rtt: 40, delay: 4, behind: 2 })).toBeTruthy();
  });

  it("treats relay as unhealthy (P2P did not connect)", function () {
    expect(NetStats.isHealthy({ transport: 'RELAY', rtt: 40, delay: 4, behind: 0 })).toBeFalsy();
  });

  it("treats a lagging sim as unhealthy even over P2P", function () {
    expect(NetStats.isHealthy({ transport: 'P2P', rtt: 40, delay: 4, behind: 10 })).toBeFalsy();
  });

  it("handles a missing rtt", function () {
    expect(NetStats.format({ transport: 'RELAY', rtt: 0, delay: 4, behind: 0 }))
      .toEqual('RELAY  0ms  d4');
  });
});
