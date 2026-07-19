describe("Random", function () {
  it("#getNumber", function () {
    var random = new Random();
    var number = random.getNumber();
    expect(typeof(number)).toEqual('number');
    expect(number >= 0 && number < 1).toBeTruthy();
  });

  it("same seed produces the same sequence", function () {
    Random.setSeed(12345);
    var first = [Random.getNumber(), Random.getNumber(), Random.getNumber()];
    Random.setSeed(12345);
    var second = [Random.getNumber(), Random.getNumber(), Random.getNumber()];
    expect(first).toEqual(second);
  });

  it("different seeds produce different sequences", function () {
    Random.setSeed(1);
    var first = [Random.getNumber(), Random.getNumber(), Random.getNumber()];
    Random.setSeed(2);
    var second = [Random.getNumber(), Random.getNumber(), Random.getNumber()];
    expect(first).not.toEqual(second);
  });

  it("instances share the global sequence", function () {
    Random.setSeed(777);
    var a = new Random().getNumber();
    Random.setSeed(777);
    var b = new Random().getNumber();
    expect(a).toEqual(b);
  });

  it("#arrayRandomElement is driven by the seed", function () {
    var arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    Random.setSeed(42);
    var first = [arrayRandomElement(arr), arrayRandomElement(arr), arrayRandomElement(arr)];
    Random.setSeed(42);
    var second = [arrayRandomElement(arr), arrayRandomElement(arr), arrayRandomElement(arr)];
    expect(first).toEqual(second);
  });
});
