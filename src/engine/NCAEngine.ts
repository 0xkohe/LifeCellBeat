/**
 * Neural Cellular Automata (NCA) Engine
 * Uses proper binary Conway's Life (B3/S23) with a visual smoothing layer.
 * This creates persistent oscillators, gliders, and still lifes.
 */

export class NCAEngine {
    public width: number;
    public height: number;

    // Float32Array stores [glow, colorWeight] per cell for visual rendering
    private gridA: Float32Array;
    private gridB: Float32Array;
    // Binary state grid (0 or 1) — separate from the visual float grid
    private stateA: Uint8Array;
    private stateB: Uint8Array;
    private isAActive: boolean = true;

    private readonly channels = 2;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;

        this.gridA = new Float32Array(width * height * this.channels);
        this.gridB = new Float32Array(width * height * this.channels);
        this.stateA = new Uint8Array(width * height);
        this.stateB = new Uint8Array(width * height);
        // Start empty — user places their own patterns
    }

    public randomize() {
        const grid = this.getCurrentGrid();
        const state = this.getCurrentState();
        for (let i = 0; i < this.width * this.height; i++) {
            const alive = Math.random() > 0.72 ? 1 : 0;
            state[i] = alive;
            const idx = i * this.channels;
            grid[idx] = alive;
            grid[idx + 1] = Math.random();
        }
    }

    private getCurrentState(): Uint8Array {
        return this.isAActive ? this.stateA : this.stateB;
    }

    public getCurrentGrid(): Float32Array {
        return this.isAActive ? this.gridA : this.gridB;
    }

    public insertPattern(cx: number, cy: number, radius: number) {
        const grid = this.getCurrentGrid();
        const state = this.getCurrentState();
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const dx = x - cx;
                const dy = y - cy;
                if (dx * dx + dy * dy < radius * radius) {
                    const i = y * this.width + x;
                    const alive = Math.random() > 0.4 ? 1 : 0;
                    state[i] = alive;
                    const idx = i * this.channels;
                    grid[idx] = alive;
                    grid[idx + 1] = (Math.atan2(dy, dx) / (2 * Math.PI)) + 0.5; // angle as color
                }
            }
        }
    }

    /** Insert a classic Conway's Life glider at position */
    public insertGlider(cx: number, cy: number, color: number = 0.5) {
        const grid = this.getCurrentGrid();
        const state = this.getCurrentState();
        // Classic glider (moves diagonally)
        const pattern = [
            [0, 1, 0],
            [0, 0, 1],
            [1, 1, 1],
        ];
        for (let dy = 0; dy < 3; dy++) {
            for (let dx = 0; dx < 3; dx++) {
                if (!pattern[dy][dx]) continue;
                const x = (cx + dx + this.width) % this.width;
                const y = (cy + dy + this.height) % this.height;
                const i = y * this.width + x;
                state[i] = 1;
                const idx = i * this.channels;
                grid[idx] = 1.0;
                grid[idx + 1] = color;
            }
        }
    }

    /** Insert a lightweight spaceship (LWSS) for horizontal movement */
    public insertSpaceship(cx: number, cy: number, color: number = 0.3) {
        const grid = this.getCurrentGrid();
        const state = this.getCurrentState();
        // LWSS pattern
        const pattern = [
            [1, 0, 0, 1, 0],
            [0, 0, 0, 0, 1],
            [1, 0, 0, 0, 1],
            [0, 1, 1, 1, 1],
        ];
        for (let dy = 0; dy < pattern.length; dy++) {
            for (let dx = 0; dx < pattern[0].length; dx++) {
                if (!pattern[dy][dx]) continue;
                const x = (cx + dx + this.width) % this.width;
                const y = (cy + dy + this.height) % this.height;
                const i = y * this.width + x;
                state[i] = 1;
                const idx = i * this.channels;
                grid[idx] = 1.0;
                grid[idx + 1] = color;
            }
        }
    }

    /** Insert a blinker (3-cell horizontal oscillator, period 2) */
    public insertBlinker(cx: number, cy: number, color: number = 0.5) {
        const grid = this.getCurrentGrid();
        const state = this.getCurrentState();
        for (let dx = -1; dx <= 1; dx++) {
            const x = (cx + dx + this.width) % this.width;
            const i = cy * this.width + x;
            state[i] = 1;
            const idx = i * this.channels;
            grid[idx] = 1.0;
            grid[idx + 1] = color;
        }
    }


    public insertRPentomino(cx: number, cy: number, color: number = 0.7) {
        const grid = this.getCurrentGrid();
        const state = this.getCurrentState();
        const pattern = [
            [0, 1, 1],
            [1, 1, 0],
            [0, 1, 0],
        ];
        for (let dy = 0; dy < pattern.length; dy++) {
            for (let dx = 0; dx < pattern[0].length; dx++) {
                if (!pattern[dy][dx]) continue;
                const x = (cx + dx + this.width) % this.width;
                const y = (cy + dy + this.height) % this.height;
                const i = y * this.width + x;
                state[i] = 1;
                const idx = i * this.channels;
                grid[idx] = 1.0;
                grid[idx + 1] = color;
            }
        }
    }

    public step() {
        const srcState = this.isAActive ? this.stateA : this.stateB;
        const dstState = this.isAActive ? this.stateB : this.stateA;
        const srcGrid = this.isAActive ? this.gridA : this.gridB;
        const dstGrid = this.isAActive ? this.gridB : this.gridA;

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                // Count live neighbors (binary)
                let liveNeighbors = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = (x + dx + this.width) % this.width;
                        const ny = (y + dy + this.height) % this.height;
                        liveNeighbors += srcState[ny * this.width + nx];
                    }
                }

                const i = y * this.width + x;
                const idx = i * this.channels;
                const isAlive = srcState[i] === 1;
                const colorWeight = srcGrid[idx + 1];

                // Conway's Life B3/S23
                let nextAlive: boolean;
                if (isAlive) {
                    nextAlive = liveNeighbors === 2 || liveNeighbors === 3;
                } else {
                    nextAlive = liveNeighbors === 3;
                }

                dstState[i] = nextAlive ? 1 : 0;

                // Visual: smooth glow transitions (for trail effect)
                const currentGlow = srcGrid[idx];
                const targetGlow = nextAlive ? 1.0 : 0.0;
                dstGrid[idx] = currentGlow + (targetGlow - currentGlow) * 0.65;

                // Color diffuses and slightly shifts over time
                const colorShift = nextAlive ? (Math.random() - 0.5) * 0.03 : 0;
                dstGrid[idx + 1] = Math.max(0, Math.min(1, colorWeight * 0.97 + colorShift));
            }
        }

        this.isAActive = !this.isAActive;
    }
}
