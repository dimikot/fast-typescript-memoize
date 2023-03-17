import delay from "delay";
import { Memoize } from "../Memoize";

class LargeObject {
  longString = new Array(1000000).fill("a").join("");
}

class Cls {
  @Memoize()
  async method() {
    await delay(10);
    return "ok";
  }

  async caller(_largeObject: LargeObject) {
    await this.method();
    await this.method();
  }
}

(async () => {
  let obj: Cls | undefined = new Cls();
  let largeObject: LargeObject | undefined = new LargeObject();
  let largeObjectRef = new WeakRef(largeObject);
  await obj.caller(largeObject);
  largeObject = undefined;
  await delay(100);
  global.gc!();
  console.log(
    "largeObject was garbage collected?",
    largeObjectRef.deref() === undefined ? "yes" : "no"
  );
  console.log(
    "Open chrome://inspect and take a Memory Heap Snapshot. Press ^C when done."
  );
  await delay(3600 * 1000);
})();
