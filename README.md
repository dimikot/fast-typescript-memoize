# fast-typescript-memoize: fast memoization decorator and other helpers with 1st class support for Promises

## @Memoize() decorator

A `@Memoize()` TypeScript decorator similar to
[typescript-memoize](https://www.npmjs.com/package/typescript-memoize).

Differences:

1. If used to memoize async functions, it clears the memoize cache if the
   promise gets rejected (i.e. it doesn't memoize exceptions in async
   functions).
2. Stronger typing for internal code.
3. Does not support any notion of expiration.


```ts
import { Memoize } from "fast-typescript-memoize";

class Class {
  private count = 0;

  @Memoize()
  method0() {
    return count++;
  }

  @Memoize()
  method1(arg: string) {
    return count++;
  }

  @Memoize((arg1: string, arg2: number) => `${arg1}#${arg2}`)
  method2(arg1: string, arg2: number) {
    return count++;
  }

  @Memoize()
  asyncMethod(arg: string) {
    count++;
    if (arg == "ouch") {
      throw "ouch";
    }
  }
}

const obj = new Class();
obj.method0(); // count is incremented
obj.method0(); // count is NOT incremented

obj.method1("abc"); // count is incremented
obj.method1("abc"); // count is NOT incremented
obj.method1("def"); // count is incremented

obj.method2("abc", 42); // count is incremented
obj.method2("abc", 42); // count is NOT incremented

await asyncMethod("ok"); // count is incremented
await asyncMethod("ok"); // count is NOT incremented
await asyncMethod("ouch"); // count is incremented, exception is thrown
await asyncMethod("ouch"); // count is incremented, exception is thrown
```

## memoize0(obj, tag, func)

Saves the value returned by `func()` in a hidden property `tag` (typically a
symbol) of `obj` object, so next time memoize0() is called, that value will be
returned, and `func` won't be called.

The main goal is performance and simplicity.

```ts
import { memoize0 } from "fast-typescript-memoize";

let count = 0;
const $tag = Symbol("$tag");
const obj = {};
memoize0(obj, $tag, () => count++); // count is incremented
memoize0(obj, $tag, () => count++); // count is NOT incremented
```

## memoize2(obj, tag, func)

A simple intrusive 1-slot cache memoization helper for 2 parameters `func`. It's
useful when we have a very high chance of hitrate. The helper is faster (and
more memory efficient) than a `Map<TArg1, Map<TArg2, TResult>>` based approach
since it doesn't create intermediate maps.

This method works seamlessly for async functions too: the returned Promise is
eagerly memoized, so all the callers will subscribe to the same Promise.

Returns the new memoized function with 2 arguments for the `tag`.

```ts
let count = 0;
const $tag = Symbol("$tag");
const obj = {};
memoize2(obj, $tag, (arg1, arg2) => count++)("abc", 42); // count is incremented
memoize2(obj, $tag, (arg1, arg2) => count++)("abc", 42); // count is NOT incremented
memoize2(obj, $tag, (arg1, arg2) => count++)("xyz", 101); // count is incremented
memoize2(obj, $tag, (arg1, arg2) => count++)("abc", 42); // count is incremented
```

## memoizeExpireUnused(func, { resolve, unusedMs })

Similar to [lodash.memoize()](https://lodash.com/docs/latest#memoize), but
auto-expires (and removes from memory) the cached results after the provided
number of inactive milliseconds. Each time we read a cached result, the
expiration timer starts from scratch.

This function is more expensive than `lodash.memoize()`, because it uses a JS
timer under the hood.

```ts
let count = 0;
const func = memoizeExpireUnused((s) => count++, { resolver: (s) => s, unusedMs: 1000 });
func("a"); // count is incremented
func("a"); // count is NOT incremented
... after 2 seconds, memory for the cached result is freed ...
func("a"); // count is incremented
```
