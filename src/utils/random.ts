export const randomInt = (min: number, max: number) => {
    const random = min + Math.floor(Math.random() * (max - min));
    return random;
}

export const choice = (arr: unknown[]) => {
    const randomIndex = Math.floor(randomInt(0, arr.length));
    return arr[randomIndex];
}
