// Blinking outline around the enemy tank currently controlled by the
// online enemy player. Drawn ONLY on the enemy player's own client: the
// tank players must not know which enemy is human. Rendering is local, so
// this per-client difference cannot desync the lockstep simulation.
function EnemyPlayerView(factory) {
  this._factory = factory;
  this._blinkTimer = new BlinkTimer(10);
}

EnemyPlayerView.prototype.update = function () {
  this._blinkTimer.update();
};

EnemyPlayerView.prototype.draw = function (ctx) {
  if (!this._isLocalEnemyPlayer()) {
    return;
  }
  var tank = this._factory.getControlledTank();
  if (tank === null || !this._blinkTimer.isVisible()) {
    return;
  }
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(tank.getX() - 2, tank.getY() - 2, tank.getWidth() + 4, tank.getHeight() + 4);
};

EnemyPlayerView.prototype._isLocalEnemyPlayer = function () {
  return typeof NetworkSession !== 'undefined' &&
    NetworkSession.instance !== null &&
    NetworkSession.instance.getPlayerNumber() == 3;
};
