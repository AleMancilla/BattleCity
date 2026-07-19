describe("EnemyPlayerControllerFactory", function () {
  var eventManager, spriteContainer, aiContainer, aiFactory, factory;

  function createEnemy() {
    var tank = new Tank(eventManager);
    tank.makeEnemy();
    eventManager.fireEvent({'name': EnemyFactory.Event.ENEMY_CREATED, 'enemy': tank});
    return tank;
  }

  function aiControllerFor(tank) {
    var result = null;
    aiContainer.getControllers().forEach(function (controller) {
      if (controller.getTank() === tank) {
        result = controller;
      }
    });
    return result;
  }

  beforeEach(function () {
    eventManager = new EventManager();
    spriteContainer = new SpriteContainer(eventManager);
    aiContainer = new AITankControllerContainer(eventManager);
    aiFactory = new AITankControllerFactory(eventManager, spriteContainer);
    factory = new EnemyPlayerControllerFactory(eventManager);
    factory.setAIControllersContainer(aiContainer);
  });

  it("takes control of the first spawned enemy and removes its AI controller", function () {
    var enemy = createEnemy();
    expect(factory.getControlledTank()).toBe(enemy);
    expect(aiControllerFor(enemy)).toBeNull();
  });

  it("leaves later enemies to the AI while controlling one", function () {
    var first = createEnemy();
    var second = createEnemy();
    expect(factory.getControlledTank()).toBe(first);
    expect(aiControllerFor(second)).not.toBeNull();
  });

  it("transfers control to the next spawn after the controlled enemy dies", function () {
    var first = createEnemy();
    eventManager.fireEvent({'name': Tank.Event.DESTROYED, 'tank': first});
    expect(factory.getControlledTank()).toBeNull();
    var second = createEnemy();
    expect(factory.getControlledTank()).toBe(second);
    expect(aiControllerFor(second)).toBeNull();
  });

  it("ignores deaths of enemies it does not control", function () {
    var first = createEnemy();
    var second = createEnemy();
    eventManager.fireEvent({'name': Tank.Event.DESTROYED, 'tank': second});
    expect(factory.getControlledTank()).toBe(first);
  });

  it("starts the controller frozen when taking over during a freeze", function () {
    eventManager.fireEvent({'name': PowerUpHandler.Event.FREEZE});
    createEnemy();
    expect(factory._controller.isFreezed()).toBeTruthy();
  });
});

describe("EnemyPlayerController", function () {
  var eventManager, tank, controller;

  beforeEach(function () {
    eventManager = new EventManager();
    tank = new Tank(eventManager);
    tank.makeEnemy();
    controller = new EnemyPlayerController(eventManager, tank);
  });

  it("moves the tank with player 3 virtual keys", function () {
    controller.keyPressed(Keyboard.Key.J);
    expect(tank.getDirection()).toEqual(Sprite.Direction.LEFT);
    controller.keyPressed(Keyboard.Key.I);
    expect(tank.getDirection()).toEqual(Sprite.Direction.UP);
  });

  it("shoots with the player 3 shoot key", function () {
    spyOn(tank, 'shoot');
    controller.keyPressed(Keyboard.Key.H);
    expect(tank.shoot).toHaveBeenCalled();
  });

  it("ignores input while frozen and stops the tank", function () {
    spyOn(tank, 'stop');
    controller.freeze();
    expect(tank.stop).toHaveBeenCalled();
    controller.keyPressed(Keyboard.Key.J);
    expect(tank.getDirection()).not.toEqual(Sprite.Direction.LEFT);
  });

  it("accepts input again after unfreeze", function () {
    controller.freeze();
    controller.unfreeze();
    controller.keyPressed(Keyboard.Key.L);
    expect(tank.getDirection()).toEqual(Sprite.Direction.RIGHT);
  });
});
