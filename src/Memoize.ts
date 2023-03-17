/**
 * A @Memoize() decorator similar to
 * https://www.npmjs.com/package/typescript-memoize. Differences:
 * 1. If used to memoize async functions, it clears the memoize cache if the
 *    promise gets rejected (i.e. it doesn't memoize exceptions in async
 *    functions).
 * 2. Stronger typing for internal code.
 */
export function Memoize(hasher?: (...args: any[]) => unknown) {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>
  ) => {
    if (descriptor.value !== null && descriptor.value !== undefined) {
      descriptor.value = buildNewMethod(descriptor.value, hasher);
    } else if (descriptor.get) {
      descriptor.get = buildNewMethod(descriptor.get, hasher);
    } else {
      throw "Only put a @Memoize() decorator on a method or get accessor.";
    }
  };
}

let counter = 0;

type PropValName = `__memoized_value_${number}`;
type PropMapName = `__memoized_map_${number}`;

/**
 * Builds a new function which will be returned instead of the original
 * decorated method.
 */
function buildNewMethod<
  TThis extends Partial<{
    [k: PropValName]: TRet;
    [k: PropMapName]: Map<unknown, TRet>;
  }>,
  TArgs extends unknown[],
  TRet
>(
  origMethod: (this: TThis, ...args: TArgs) => TRet,
  hasher?: (...args: TArgs) => unknown
): (this: TThis, ...args: TArgs) => TRet {
  const identifier = ++counter;

  return function (this: TThis, ...args: TArgs): TRet {
    let value: TRet;

    if (hasher || args.length > 0) {
      const propMapName: PropMapName = `__memoized_map_${identifier}`;

      // Get or create map
      if (!this.hasOwnProperty(propMapName)) {
        Object.defineProperty(this, propMapName, {
          configurable: false,
          enumerable: false,
          writable: false,
          value: new Map(),
        });
      }

      const map = this[propMapName]!;
      const hashKey = hasher ? hasher.apply(this, args) : args[0];

      if (map.has(hashKey)) {
        value = map.get(hashKey)!;
      } else {
        value = origMethod.apply(this, args);
        if (value instanceof Promise) {
          value = value.catch(
            deleteMapKeyAndRethrow.bind(undefined, map, hashKey)
          ) as TRet;
        }

        map.set(hashKey, value);
      }
    } else {
      const propValName: PropValName = `__memoized_value_${identifier}`;

      if (this.hasOwnProperty(propValName)) {
        value = this[propValName]!;
      } else {
        value = origMethod.apply(this, args);
        if (value instanceof Promise) {
          value = value.catch(
            deleteObjKeyAndRethrow.bind(undefined, this, propValName)
          ) as TRet;
        }

        Object.defineProperty(this, propValName, {
          configurable: true, // to be able to remove it
          enumerable: false,
          writable: false,
          value,
        });
      }
    }

    return value;
  };
}

/**
 * A helper function to just not use "=>" closures and thus control, which
 * variables will be retained from garbage collection.
 */
function deleteMapKeyAndRethrow(
  map: Map<unknown, unknown>,
  key: unknown,
  e: unknown
) {
  map.delete(key);
  throw e;
}

/**
 * A helper function to just not use "=>" closures and thus control, which
 * variables will be retained from garbage collection.
 */
function deleteObjKeyAndRethrow(
  obj: Record<string, unknown>,
  key: string,
  e: unknown
) {
  delete obj[key];
  throw e;
}
