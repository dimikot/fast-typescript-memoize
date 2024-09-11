# fast-typescript-memoize: fast memoization decorator and other helpers with 1st class support for Promises

## `@Memoize()` decorator

Remembers the returned value of a decorated method or getter in a hidden `this`
object's property, so next time the method is called, the value will be returned
immediately, without re-executing the method. This also works for async methods
which return a Promise: in this case, multiple parallel calls to that method
will coalesce into one call.

To work properly, requires TypeScript v5+.

The idea of `@Memoize()` decorator is brought from
[typescript-memoize](https://www.npmjs.com/package/typescript-memoize).
Differences:

1. If used to memoize async methods, by default (and when
   `clearOnResolve=true`), it clears the memoize cache as soon as the Promise
   gets rejected (i.e. it doesn't memoize exceptions in async methods). Parallel
   async calls to the same method will still be coalesced into one call though
   (until the Promise rejects).
2. A special mode is added, `clearOnResolve`. If `true`, successfully resolved
   Promises returned from an async method will be removed from the cache as soon
   as the method finishes. This is a convenient mode for the cases when we want
   to coalesce multiple parallel executions of some method (e.g. when there is a
   burst of runs), but we don't want to prevent the method from further running.
3. Strong typing for the optional hasher handler, including types of arguments
   and even the type of `this`.
4. Does not support any notion of expiration.
5. When the 1st argument of the method is an object (or when hasher handler
   returns an object), it is not retained from GC, so you can memoize on object
   args safely, without thinking about memory leaks.

```ts
import { Memoize } from "fast-typescript-memoize";

class Class {
  private count = 0;
  private some = 42;

  @Memoize()
  method0() {
    return count++;
  }

  @Memoize()
  method1(arg: string) {
    return count++;
  }

  @Memoize()
  method1obj(arg: object) {
    return count++;
  }

  @Memoize((arg1, arg2) => `${arg1}#${arg2}`)
  method2(arg1: string, arg2: number) {
    return count++;
  }

  @Memoize(function (arg1, arg2) { return `${this.some}:${arg1}#${arg2}`; })
  method2this(arg1: string, arg2: number) {
    return count++;
  }

  @Memoize()
  async asyncMethod(arg: string) {
    count++;
    if (arg == "ouch") {
      throw "ouch";
    }
  }

  @Memoize({ clearOnResolve: true })
  async asyncCoalescingMethod(arg: string) {
    await delay(100);
    count++;
  }
}

const obj = new Class();
const arg = { my: 42 };

obj.method0(); // count is incremented
obj.method0(); // count is NOT incremented

obj.method1("abc"); // count is incremented
obj.method1("abc"); // count is NOT incremented
obj.method1("def"); // count is incremented

obj.method1obj(arg); // count is incremented, arg is not retained
obj.method1obj(arg); // count is NOT incremented

obj.method2("abc", 42); // count is incremented
obj.method2("abc", 42); // count is NOT incremented

obj.method2this("abc", 42); // count is incremented (strongly typed `this`)
obj.method2this("abc", 42); // count is NOT incremented

await asyncMethod("ok"); // count is incremented
await asyncMethod("ok"); // count is NOT incremented
await asyncMethod("ouch"); // count is incremented, exception is thrown
await asyncMethod("ouch"); // count is incremented, exception is thrown

await asyncCoalescingMethod("ok"); // count is incremented
await asyncCoalescingMethod("ok"); // count is incremented again
const [c1, c2] = await Promise.all([
  asyncCoalescingMethod("ok"), // count is incremented
  asyncCoalescingMethod("ok"), // not incremented! coalescing parallel calls
]);
assert(c1 === c2);
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
