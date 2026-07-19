function LivesView(player, player2) {
  this._player = player;
  this._player2 = player2;
}

LivesView.prototype.draw = function (ctx) {
  ctx.fillStyle = "#000000";
  ctx.font = "16px prstart"

  ctx.drawImage(ImageManager.getImage('roman_one'), 468, 256);

  ctx.fillText("P", 482, 286 - 16);
  ctx.fillText(this._player.getLives(), 482, 286);

  ctx.drawImage(ImageManager.getImage('lives'), 465, 272);

  if (this._player2 !== undefined) {
    ctx.drawImage(ImageManager.getImage('roman_one'), 464, 308);
    ctx.drawImage(ImageManager.getImage('roman_one'), 472, 308);

    ctx.fillText("P", 482, 338 - 16);
    ctx.fillText(this._player2.getLives(), 482, 338);

    ctx.drawImage(ImageManager.getImage('lives'), 465, 324);
  }
};
