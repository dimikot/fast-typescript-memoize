/**
 * Additional options for `@Memoize()` decorator.
 */
export interface MemoizeOptions {
  /** Defaults to `true`. If true, rejected Promises returned from an async
   * method will be removed from the cache as soon as the method finishes. */
  clearOnReject?: boolean;
  /** Defaults to `false`. If true, successfully resolved Promises returned from
   * an async method will be removed from the cache as soon as the method
   * finishes. This is a convenient mode for the cases when we want to coalesce
   * multiple parallel executions of some method (e.g. when there is a burst of
   * runs), but we don't want to prevent the method from further running. */
  clearOnResolve?: boolean;
}

/**
 * Remembers the returned value of a decorated method or getter in a hidden
 * `this` object's property, so next time the method is called, the value will
 * be returned immediately, without re-executing the method. This also works for
 * async methods which return a Promise: in this case, multiple parallel calls
 * to that method will coalesce into one call.
 *
 * All `@Memoize()` calls, for both methods and getters, accept a hasher
 * function with the same list of arguments as the method itself (or, in case of
 * a getter, with no arguments). The slot for the saved value will depend on the
 * value returned by the hasher.
 */
export function Memoize<TThis, TValue>(
  hasher: TValue extends (...args: never[]) => unknown
    ? (this: TThis, ...args: Parameters<TValue>) => unknown
    : (this: TThis) => unknown,
  options?: MemoizeOptions
): (
  target: TThis,
  propertyKey: string | symbol,
  descriptor: { value?: TValue }
) => void;

/**
 * Remembers the returned value of a decorated method or getter in a hidden
 * `this` object's property, so next time the method is called, the value will
 * be returned immediately, without re-executing the method. This also works for
 * async methods which return a Promise: in this case, multiple parallel calls
 * to that method will coalesce into one call.
 *
 * Almost all `@Memoize()` calls may also omit the hasher function. Then, for
 * 0-argument methods or getters, the slot for the saved value will be fixed.
 * For 1-argument methods, the slot will be chosen based on that single
 * argument's value. For methods with 2+ arguments, you must provide your own
 * hasher function.
 */
export function Memoize<TThis, TValue>(
  options?: MemoizeOptions
): (
  target: TThis,
  propertyKey: string | symbol,
  descriptor: { value?: TValue }
) => ((a1: unknown, a2: unknown, ...args: unknown[]) => never) extends TValue
  ? TValue extends (a1: never, a2: never, ...args: never[]) => unknown
    ? "provide-hasher-when-method-has-more-than-one-arg"
    : void
  : void;

/**
 * A @Memoize() decorator implementation, inspired by:
 * https://www.npmjs.com/package/typescript-memoize.
 */
export function Memoize<TThis extends object, TArgs extends any[]>(
  a1?: ((this: TThis, ...args: TArgs) => unknown) | MemoizeOptions,
  a2?: MemoizeOptions
): (
  target: TThis,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<(this: TThis, ...args: TArgs) => any>
) => void {
  const [hasher, options] =
    typeof a1 === "function" ? [a1, a2] : [undefined, a1];
  return (_target, _propertyKey, descriptor) => {
    if (typeof descriptor.value === "function") {
      descriptor.value = buildNewMethod(descriptor.value, hasher, options);
    } else if (descriptor.get) {
      descriptor.get = buildNewMethod(descriptor.get, hasher, options);
    } else {
      throw "Only put @Memoize() decorator on a method or get accessor.";
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
  hasher?: (...args: TArgs) => unknown,
  { clearOnReject, clearOnResolve }: MemoizeOptions = {
    clearOnReject: true,
    clearOnResolve: false,
  }
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

        if (clearOnReject && value instanceof Promise) {
          value = value.catch(
            deleteMapKeyAndRethrow.bind(undefined, map, hashKey)
          ) as TRet;
        }

        if (clearOnResolve && value instanceof Promise) {
          value = value.then(
            deleteMapKeyAndReturn.bind(undefined, map, hashKey)
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

        if (clearOnReject && value instanceof Promise) {
          value = value.catch(
            deleteObjPropAndRethrow.bind(undefined, this, propValName)
          ) as TRet;
        }

        if (clearOnResolve && value instanceof Promise) {
          value = value.then(
            deleteObjPropAndReturn.bind(undefined, this, propValName)
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
): never {
  map.delete(key);
  throw e;
}

/**
 * A helper function to just not use "=>" closures and thus control, which
 * variables will be retained from garbage collection.
 */
function deleteObjPropAndRethrow(
  obj: Record<string, unknown>,
  key: string,
  e: unknown
): never {
  delete obj[key];
  throw e;
}

/**
 * A helper function to just not use "=>" closures and thus control, which
 * variables will be retained from garbage collection.
 */
function deleteMapKeyAndReturn<T>(
  map: Map<unknown, unknown>,
  key: unknown,
  value: T
): T {
  map.delete(key);
  return value;
}

/**
 * A helper function to just not use "=>" closures and thus control, which
 * variables will be retained from garbage collection.
 */
function deleteObjPropAndReturn<T>(
  obj: Record<string, unknown>,
  key: string,
  value: T
): T {
  delete obj[key];
  return value;
}
