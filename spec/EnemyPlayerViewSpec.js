describe("EnemyPlayerView", function () {
  var factory, tank, ctx, view, originalInstance;

  beforeEach(function () {
    var eventManager = new EventManager();
    tank = new Tank(eventManager);
    tank.makeEnemy();
    factory = { getControlledTank: function () { return tank; } };
    ctx = { strokeRect: jasmine.createSpy('strokeRect') };
    view = new EnemyPlayerView(factory);
    originalInstance = NetworkSession.instance;
  });

  afterEach(function () {
    NetworkSession.instance = originalInstance;
  });

  it("draws the marker on the enemy player's client", function () {
    NetworkSession.instance = { getPlayerNumber: function () { return 3; } };
    view.draw(ctx);
    expect(ctx.strokeRect).toHaveBeenCalled();
  });

  it("stays hidden on the tank players' clients", function () {
    NetworkSession.instance = { getPlayerNumber: function () { return 1; } };
    view.draw(ctx);
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });

  it("stays hidden outside network play", function () {
    NetworkSession.instance = null;
    view.draw(ctx);
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });

  it("draws nothing while no enemy is controlled", function () {
    NetworkSession.instance = { getPlayerNumber: function () { return 3; } };
    factory.getControlledTank = function () { return null; };
    view.draw(ctx);
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });
});
