/**
 * Similar to lodash.memoize(), but auto-expires the cached results after the
 * provided number of inactive milliseconds. Each time we read a cached result,
 * the expiration timer resets.
 *
 * This function is more expensive than lodash.memoize(), because it uses a JS
 * timer under the hood.
 */
export function memoizeExpireUnused<TThis, TArgs extends unknown[], TResult>(
  func: (this: TThis, ...args: TArgs) => TResult,
  {
    resolver,
    unusedMs,
  }: {
    resolver?: (this: TThis, ...args: TArgs) => unknown;
    unusedMs?: number;
  } = {}
): typeof func {
  const cache = new Map<unknown, { result: TResult; timeout?: any }>();
  return function (this: TThis, ...args: TArgs) {
    const key = resolver ? resolver.apply(this, args) : args[0];

    let slot = cache.get(key)!;
    if (!slot) {
      const result = func.apply(this, args);
      slot = { result };
      cache.set(key, slot);
    }

    if (unusedMs) {
      if (slot.timeout) {
        clearTimeout(slot.timeout);
      }
      slot.timeout = setTimeout(
        removeMapKey.bind(cache, key),
        unusedMs
      ).unref?.();
    }

    return slot.result;
  };
}

function removeMapKey<TKey>(this: Map<TKey, unknown>, key: TKey) {
  this.delete(key);
}
