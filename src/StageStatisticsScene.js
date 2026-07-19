function StageStatisticsScene(sceneManager, stage, player, gameOver, player2) {
  var self = this;

  this._sceneManager = sceneManager;
  this._stage = stage;
  this._player = player;
  this._player2 = player2;
  this._gameOver = gameOver;

  this._script = new Script();

  this._basicTankPoints = this._createRow(100, Tank.Type.BASIC);
  this._fastTankPoints = this._createRow(200, Tank.Type.FAST);
  this._powerTankPoints = this._createRow(300, Tank.Type.POWER);
  this._armorTankPoints = this._createRow(400, Tank.Type.ARMOR);
  this._drawTotal = false;

  this._script.enqueue(new Delay(this._script, 30));
  this._enqueueRow(this._basicTankPoints);
  this._enqueueRow(this._fastTankPoints);
  this._enqueueRow(this._powerTankPoints);
  this._enqueueRow(this._armorTankPoints);
  this._script.enqueue({execute: function () { self._drawTotal = true; }});
  this._script.enqueue(new Delay(this._script, 60));
  this._script.enqueue({execute: function () {
    self._player.resetTanks();
    if (self._player2 !== undefined) {
      self._player2.resetTanks();
    }
    if (gameOver) {
      sceneManager.toGameOverScene();
    }
    else {
      sceneManager.toGameScene(stage + 1, player, player2);
    }
  }});
};

StageStatisticsScene.prototype._createRow = function (value, tankType) {
  var self = this;
  var row = {completed: 0, expected: this._player2 === undefined ? 1 : 2};
  var listener = {actionCompleted: function () {
    row.completed++;
    if (row.completed >= row.expected) {
      self._script.actionCompleted();
    }
  }};
  row.p1 = new StageStatisticsPoints(value, this._player.getTanks(tankType), listener);
  row.p2 = this._player2 === undefined ? null : new StageStatisticsPoints(value, this._player2.getTanks(tankType), listener);
  return row;
};

StageStatisticsScene.prototype._enqueueRow = function (row) {
  this._script.enqueue({execute: function () {
    row.p1.show();
    if (row.p2 !== null) {
      row.p2.show();
    }
  }});
  this._script.enqueue({update: function () {
    row.p1.update();
    if (row.p2 !== null) {
      row.p2.update();
    }
  }});
};

StageStatisticsScene.prototype.update = function () {
  this._script.update();
};

StageStatisticsScene.prototype.draw = function (ctx) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.fillStyle = "#feac4e";
  ctx.fillText("20000", 306, 46);

  ctx.fillStyle = "#ffffff";
  ctx.fillText("STAGE " + ("" + this._stage).lpad(" ", 2), 194, 78);

  ctx.drawImage(ImageManager.getImage('roman_one_red'), 52, 96);

  ctx.fillStyle = "#e44437";
  ctx.fillText("-PLAYER", 66, 110);

  ctx.fillStyle = "#feac4e";
  ctx.fillText(("" + this._player.getScore()).lpad(" ", 7), 66, 142);

  if (this._player2 !== undefined) {
    ctx.drawImage(ImageManager.getImage('roman_one_red'), 300, 96);
    ctx.drawImage(ImageManager.getImage('roman_one_red'), 308, 96);

    ctx.fillStyle = "#e44437";
    ctx.fillText("-PLAYER", 316, 110);

    ctx.fillStyle = "#feac4e";
    ctx.fillText(("" + this._player2.getScore()).lpad(" ", 7), 316, 142);
  }

  ctx.fillStyle = "#ffffff";

  this._drawRow(ctx, this._basicTankPoints, 190, 'tank_basic_up_c0_t1');
  this._drawRow(ctx, this._fastTankPoints, 238, 'tank_fast_up_c0_t1');
  this._drawRow(ctx, this._powerTankPoints, 286, 'tank_power_up_c0_t1');
  this._drawRow(ctx, this._armorTankPoints, 334, 'tank_armor_up_c0_t1');

  ctx.fillText("TOTAL", 100, 366);
  ctx.drawImage(ImageManager.getImage('white_line'), 192, 346);
  if (this._drawTotal) {
    ctx.fillText(("" + this._player.getTanksCount()).lpad(" ", 2), 194, 366);
    if (this._player2 !== undefined) {
      ctx.fillText(("" + this._player2.getTanksCount()).lpad(" ", 2), 450, 366);
    }
  }
};

StageStatisticsScene.prototype._drawRow = function (ctx, row, y, tankImage) {
  ctx.fillText("PTS", 130, y);
  row.p1.draw(ctx, 34, y);
  if (row.p2 !== null) {
    ctx.fillText("PTS", 386, y);
    row.p2.draw(ctx, 290, y);
  }
  ctx.drawImage(ImageManager.getImage(tankImage), 241, y - 21);
  ctx.drawImage(ImageManager.getImage('arrow'), 226, y - 14);
};
