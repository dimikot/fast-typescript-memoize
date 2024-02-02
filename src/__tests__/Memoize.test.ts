import delay from "delay";
import { Memoize } from "..";

test("memoizes Promise", async () => {
  class Cls {
    private count = 0;
    private some = 42;

    incrementSome() {
      this.some++;
    }

    @Memoize()
    get getter0a() {
      return this.count++;
    }

    @Memoize(function () {
      return this.some;
    })
    get getter0b(): Promise<number> {
      return delay(10).then(() => this.count++);
    }

    @Memoize()
    get getter0c(): object {
      return { count: this.count++ };
    }

    @Memoize()
    async method0a() {
      return this.count++;
    }

    @Memoize()
    async method1a(_arg: string) {
      return this.count++;
    }

    @Memoize((a1) => a1.substring(0, 1))
    async method1b(_arg: string) {
      return this.count++;
    }

    @Memoize((a1, a2) => a1.substring(0, 1) + a2)
    async method2a(_arg1: string, _arg2: number) {
      return this.count++;
    }

    @Memoize(function (a1, a2) {
      return this.some + a1.substring(0, 1) + a2;
    })
    async method2b(_arg1: string, _arg2: number) {
      return this.count++;
    }

    @Memoize((a1, a2) => a1.substring(0, 1) + a2)
    async method3a(_arg1: string, _arg2: number, _arg3: boolean) {
      return this.count++;
    }

    /*
    // The following definitions must FAIL typechecking.

    @Memoize((a) => a)
    get getter0err() {
      return this.count++;
    }

    @Memoize((a) => a)
    async method0err() {
      return this.count++;
    }

    @Memoize()
    async method2err(_arg1: string, _arg2: number) {
      return this.count++;
    }

    @Memoize({ clearOnResolve: true })
    async method2errOptions(_arg1: string, _arg2: number) {
      return this.count++;
    }

    @Memoize()
    async method3err(_arg1: string, _arg2: number, _arg3: boolean) {
      return this.count++;
    }
    */
  }

  const obj = new Cls();

  expect(obj.getter0a).toEqual(obj.getter0a);

  expect(await obj.getter0b).toEqual(await obj.getter0b);

  expect(await obj.method0a()).toEqual(await obj.method0a());

  expect(await obj.method1a("a")).toEqual(await obj.method1a("a"));
  expect(await obj.method1a("c")).not.toEqual(await obj.method1a("d"));

  expect(await obj.method2a("ab", 10)).toEqual(await obj.method2a("a*", 10));
  expect(await obj.method2a("ab", 10)).not.toEqual(
    await obj.method2a("a*", 20)
  );

  const ret = await obj.method2b("abc", 10);
  expect(ret).toEqual(await obj.method2b("a**", 10));
  obj.incrementSome();
  expect(ret).not.toEqual(await obj.method2b("a**", 10));
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

test("does not memoize resolved Promise if specified in options", async () => {
  class Cls {
    private count = 0;
    private some = 42;

    incrementSome() {
      this.some++;
    }

    @Memoize({ clearOnResolve: true })
    get getter0aOptions(): Promise<number> {
      return delay(10).then(() => this.count++);
    }

    @Memoize({ clearOnResolve: true })
    async method0aOptions() {
      await delay(10);
      return this.count++;
    }

    @Memoize({ clearOnResolve: true })
    async method1aOptions(_arg: string) {
      await delay(10);
      return this.count++;
    }

    @Memoize(
      function (a1, a2) {
        return this.some + a1.substring(0, 1) + a2;
      },
      { clearOnResolve: true }
    )
    async method2aOptions(_arg1: string, _arg2: number) {
      await delay(10);
      return this.count++;
    }
  }

  const obj = new Cls();

  {
    const p1 = obj.getter0aOptions;
    const p2 = obj.getter0aOptions;
    expect(await p1).toEqual(await p2);
    expect(await p1).not.toEqual(await obj.getter0aOptions);
  }

  {
    const p1 = obj.method0aOptions();
    const p2 = obj.method0aOptions();
    expect(await p1).toEqual(await p2);
    expect(await p1).not.toEqual(await obj.method0aOptions());
  }

  {
    const p1 = obj.method1aOptions("a");
    const p2 = obj.method1aOptions("a");
    expect(await p1).toEqual(await p2);
    expect(await p1).not.toEqual(await obj.method1aOptions("a"));
  }

  {
    const p1 = obj.method2aOptions("ab", 10);
    const p2 = obj.method2aOptions("a*", 10);
    expect(await p1).toEqual(await p2);
    expect(await p1).not.toEqual(await obj.method2aOptions("a*", 10));
  }

  {
    const p1 = obj.method2aOptions("xy", 10);
    obj.incrementSome();
    const p2 = obj.method2aOptions("xy", 10);
    expect(await p1).not.toEqual(await p2);
  }
});
