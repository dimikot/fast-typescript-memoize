import delay from "delay";
import { memoizeExpireUnused } from "..";

test("expires a key when unused", async () => {
  let count = 0;
  const func = memoizeExpireUnused((s: string) => count++, {
    resolver: (s) => s,
    unusedMs: 1000,
  });
  expect(func("a")).toEqual(0);
  expect(func("a")).toEqual(0);
  await delay(100);
  expect(func("a")).toEqual(0);
  await delay(500);
  expect(func("a")).toEqual(0);
  await delay(500);
  expect(func("a")).toEqual(0);
  await delay(1000);
  expect(func("a")).toEqual(1);
});
