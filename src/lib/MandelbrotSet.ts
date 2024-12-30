export type ComplexNumber = { x: number; y: number };
export type CacheItem = {
    c: ComplexNumber;
    z: ComplexNumber;
    n: number;
    final: boolean;
};

export class CalcCache {
    cache: CacheItem[];
    constructor(public cache_size: number = 100000) {
        console.log(`CalcCache.constructor(${cache_size})`);
        this.cache = new Array(cache_size) as CacheItem[];
    }

    generateHash(c: ComplexNumber): number {
        // Scale and quantize the floats to reduce precision (optional)
        const scaleFactor = 1e6; // Adjust to control precision
        const scaledX = Math.round(c.x * scaleFactor);
        const scaledY = Math.round(c.y * scaleFactor);

        // Use a simple hashing technique like Cantor pairing
        const cantorPairing =
            ((scaledX + scaledY) * (scaledX + scaledY + 1)) / 2 + scaledY;

        // Ensure the hash is an integer
        return Math.abs(cantorPairing) | 0;
    }

    get(c: ComplexNumber): CacheItem | undefined {
        const hash = this.generateHash(c);
        const potential = this.cache[hash % this.cache_size];

        // confirm the cache hit
        if (potential && potential.c.x === c.x && potential.c.y === c.y) {
            return potential;
        }

        return undefined;
    }

    set(c: ComplexNumber, z: ComplexNumber, n: number, final: boolean): void {
        const hash = this.generateHash(c);
        this.cache[hash % this.cache_size] = { c, z, n, final };
    }
}

export class MandelbrotSet {
    cache: CalcCache;

    constructor(cache_size: number = 100000) {
        console.log(`MandelbrotSet.constructor(${cache_size})`);
        this.cache = new CalcCache(cache_size);
    }

    iterations(c: ComplexNumber, maxIterations: number): number {
        let z = { x: 0, y: 0 };
        let n = 0;

        // check the cache first & preset the calculation if found
        const cached = this.cache.get(c);
        if (cached) {
            // we've already searched this point deeper
            if (cached.n >= maxIterations) {
                return maxIterations;
            } else if (cached.final) {
                return cached.n;
            }

            // we've already searched this point, continue from where we left off
            z = cached.z;
            n = cached.n;
        }

        while (n < maxIterations && z.x * z.x + z.y * z.y < 4) {
            const x = z.x * z.x - z.y * z.y + c.x;
            const y = 2 * z.x * z.y + c.y;
            z = { x, y };
            n++;
        }

        // cache the result
        this.cache.set(c, z, n, !(z.x * z.x + z.y * z.y < 4));
        return n;
    }
}
