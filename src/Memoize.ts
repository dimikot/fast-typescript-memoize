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
  propName: string | symbol,
  descriptor: TypedPropertyDescriptor<(this: TThis, ...args: TArgs) => any>
) => void {
  const [hasher, options] =
    typeof a1 === "function" ? [a1, a2] : [undefined, a1];
  return (_target, propName, descriptor) => {
    if (typeof descriptor.value === "function") {
      descriptor.value = buildNewMethod(
        descriptor.value,
        propName,
        hasher,
        options
      );
    } else if (descriptor.get) {
      descriptor.get = buildNewMethod(
        descriptor.get,
        propName,
        hasher,
        options
      );
    } else {
      throw "Only put @Memoize() decorator on a method or get accessor.";
    }
  };
}

let counter = 0;

type PropWeakName = `__memoized_weak_${string}_${number}`;
type PropMapName = `__memoized_map_${string}_${number}`;
type PropValName = `__memoized_val_${string}_${number}`;

/**
 * Builds a new function which will be returned instead of the original
 * decorated method.
 */
function buildNewMethod<
  TThis extends Partial<{
    [k: PropWeakName]: WeakMap<object, TRet>;
    [k: PropMapName]: Map<unknown, TRet>;
    [k: PropValName]: TRet;
  }>,
  TArgs extends unknown[],
  TRet
>(
  origMethod: (this: TThis, ...args: TArgs) => TRet,
  propName: string | symbol,
  hasher?: (...args: TArgs) => unknown,
  { clearOnReject, clearOnResolve }: MemoizeOptions = {
    clearOnReject: true,
    clearOnResolve: false,
  }
): (this: TThis, ...args: TArgs) => TRet {
  // Depending on the arguments of the method we're memoizing, we use one of 3
  // storages (with some code boilerplate for performance):
  // - If the arguments hash (defaults to the 1st argument) is a JS OBJECT, we
  //   store the memoized value in a WeakMap keyed by that object. It allows JS
  //   GC to garbage collect that object since it's not retained in the internal
  //   memoized WeakMap. Motivation: if we lose the object, we obviously can't
  //   pass it to any method with `Memoize()`, and thus, we anyways won't be
  //   able to access the memoized value, so WeakMap is a perfect hit here.
  // - If the arguments hash is of a PRIMITIVE TYPE, we store the memoized value
  //   in a regular Map. Primitive types (like strings, numbers etc.) can't be
  //   used as WeakMap keys for obvious reasons.
  // - And lastly, if it's a NO-ARGUMENTS METHOD, we store the value in a hidden
  //   object property directly. This is the most frequent use case.
  const propWeakName: PropWeakName = `__memoized_weak_${propName.toString()}_${counter}`;
  const propMapName: PropMapName = `__memoized_map_${propName.toString()}_${counter}`;
  const propValName: PropValName = `__memoized_val_${propName.toString()}_${counter}`;
  counter++;

  return function (this: TThis, ...args: TArgs): TRet {
    let value: TRet;

    if (hasher || args.length > 0) {
      const hashKey = hasher ? hasher.apply(this, args) : args[0];

      if (hashKey !== null && typeof hashKey === "object") {
        // Arg (or hash) is an object: WeakMap.
        if (!this.hasOwnProperty(propWeakName)) {
          Object.defineProperty(this, propWeakName, {
            configurable: false,
            enumerable: false,
            writable: false,
            value: new WeakMap(),
          });
        }

        const weak = this[propWeakName]!;
        if (weak.has(hashKey)) {
          value = weak.get(hashKey)!;
        } else {
          value = origMethod.apply(this, args);

          if (clearOnReject && value instanceof Promise) {
            value = value.catch(
              deleteWeakKeyAndRethrow.bind(undefined, weak, hashKey)
            ) as TRet;
          }

          if (clearOnResolve && value instanceof Promise) {
            value = value.then(
              deleteWeakKeyAndReturn.bind(undefined, weak, hashKey)
            ) as TRet;
          }

          weak.set(hashKey, value);
        }
      } else {
        // Arg (or hash) is a primitive type: Map.
        if (!this.hasOwnProperty(propMapName)) {
          Object.defineProperty(this, propMapName, {
            configurable: false,
            enumerable: false,
            writable: false,
            value: new Map(),
          });
        }

        const map = this[propMapName]!;
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
      }
    } else {
      // No arg: plain object property.
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

//
// Below are helper functions to just not use "=>" closures and thus control,
// which variables will be retained from garbage collection.
//

function deleteWeakKeyAndRethrow(
  weak: WeakMap<object, unknown>,
  key: object,
  e: unknown
): never {
  weak.delete(key);
  throw e;
}

function deleteMapKeyAndRethrow(
  map: Map<unknown, unknown>,
  key: unknown,
  e: unknown
): never {
  map.delete(key);
  throw e;
}

function deleteObjPropAndRethrow(
  obj: Record<string, unknown>,
  key: string,
  e: unknown
): never {
  delete obj[key];
  throw e;
}

function deleteWeakKeyAndReturn<T>(
  weak: WeakMap<object, unknown>,
  key: object,
  value: T
): T {
  weak.delete(key);
  return value;
}

function deleteMapKeyAndReturn<T>(
  map: Map<unknown, unknown>,
  key: unknown,
  value: T
): T {
  map.delete(key);
  return value;
}

function deleteObjPropAndReturn<T>(
  obj: Record<string, unknown>,
  key: string,
  value: T
): T {
  delete obj[key];
  return value;
}
