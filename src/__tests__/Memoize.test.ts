import { Memoize } from "..";

test("memoizes Promise", async () => {
  class Cls {
    private count = 0;

    @Memoize()
    async method() {
      return this.count++;
    }

    @Memoize()
    async method1(_arg: string) {
      return this.count++;
    }
  }

  const obj = new Cls();
  expect(await obj.method()).toEqual(await obj.method());
  expect(await obj.method1("a")).toEqual(await obj.method1("a"));
  expect(await obj.method1("c")).not.toEqual(await obj.method1("d"));
});

test("does not memoize rejected Promise", async () => {
  class Cls {
    private count = 0;

    @Memoize()
    async method() {
      throw Error(`error ${this.count++}`);
    }

    @Memoize()
    async method1(_arg: string) {
      throw Error(`error ${this.count++}`);
    }
  }

  const obj = new Cls();
  await expect(obj.method()).rejects.toThrow("error 0");
  await expect(obj.method()).rejects.toThrow("error 1");
  await expect(obj.method1("a")).rejects.toThrow("error 2");
  await expect(obj.method1("a")).rejects.toThrow("error 3");
});
