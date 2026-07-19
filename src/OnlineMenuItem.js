function OnlineMenuItem(sceneManager) {
  MainMenuItem.call(this, sceneManager);
  this.setName("ONLINE");
}

OnlineMenuItem.subclass(MainMenuItem);

OnlineMenuItem.prototype.execute = function () {
  if (NetworkSession.instance !== null) {
    NetworkSession.instance.start();
  }
};
