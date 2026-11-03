
type Arg = (unknown | undefined);
type Callback<T extends Arg[], R extends Arg> = (...arg: T) => R;
export const concat = <T extends Arg[], R extends Arg>(args: T, ...callbacks: Callback<T, R>[]) => {
    let returnValue = undefined;
    for (const callback of callbacks) {
        // 'T[]' is assignable to the constraint of type 'T', but 'T' could be instantiated with a different subtype of constraint 'Args'.
        returnValue ??= callback(...args);
    }
    return returnValue;
}