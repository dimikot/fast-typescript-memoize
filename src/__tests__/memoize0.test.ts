import { memoize0 } from "..";

test("memoize0", () => {
  const $tag1 = Symbol("$tag1");
  const $tag2 = Symbol("$tag2");
  const containerA = {};
  const containerB = Buffer.from("");
  let n = 0;

  expect(memoize0(containerA, $tag1, () => n++)).toEqual(0); // -> n=1
  expect(memoize0(containerA, $tag1, () => n++)).toEqual(0);

  expect(memoize0(containerB, $tag1, () => n++)).toEqual(1); // -> n=2
  expect(memoize0(containerB, $tag2, () => n++)).toEqual(2); // different tag
});
