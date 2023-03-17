/**
 * Saves the value returned by `func()` in a hidden property `tag` of `obj`
 * object, so next time memoize0() is called, that value will be returned, and
 * `func` won't be called.
 */
export function memoize0<TTag extends symbol, TResult>(
  obj: object,
  tag: TTag,
  func: () => TResult
): TResult {
  if (!obj.hasOwnProperty(tag)) {
    Object.defineProperty(obj, tag, {
      enumerable: false,
      writable: false,
      value: func(),
    });
  }

  return (obj as any)[tag]!;
}
