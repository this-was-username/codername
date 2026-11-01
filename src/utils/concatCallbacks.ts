
type Args = (unknown | undefined)[];
type Callback<T extends Args> = (...args: T) => (unknown | undefined);
export const concat = <T extends Args>(args: T, ...callbacks: Callback<T>[]) => {
    let returnValue = undefined;
    for (const callback of callbacks) {
        // 'T[]' is assignable to the constraint of type 'T', but 'T' could be instantiated with a different subtype of constraint 'Args'.
        returnValue ??= callback(...args);
    }
    return returnValue;
}