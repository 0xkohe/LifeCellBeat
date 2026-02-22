import * as Tone from 'tone';

// ─── Types ───────────────────────────────────────────────────────────────────
export type SynthPresetName = 'pluck' | 'crystal' | 'pad' | 'fmbell' | 'bitcrush' | 'strings' | 'marimba';
export type BassPresetName = 'sawtooth' | 'sub' | 'pluck' | 'upright';
export type ScaleName =
    | 'pentatonic' | 'minor' | 'major' | 'dorian'
    | 'mixolydian' | 'phrygian' | 'lydian' | 'harmonicMinor'
    | 'blues' | 'wholeTone' | 'japanese' | 'hirajoshi';

// ─── Scale definitions ──────────────────────────────────────────────────────
const SCALE_INTERVALS: Record<ScaleName, number[]> = {
    pentatonic: [0, 3, 5, 7, 10],
    minor: [0, 2, 3, 5, 7, 8, 10],
    major: [0, 2, 4, 5, 7, 9, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
    blues: [0, 3, 5, 6, 7, 10],
    wholeTone: [0, 2, 4, 6, 8, 10],
    japanese: [0, 1, 5, 7, 8],
    hirajoshi: [0, 2, 3, 7, 8],
};

const SCALE_LABELS: Record<ScaleName, string> = {
    pentatonic: 'Pentatonic', minor: 'Minor', major: 'Major', dorian: 'Dorian',
    mixolydian: 'Mixolydian', phrygian: 'Phrygian', lydian: 'Lydian',
    harmonicMinor: 'Harmonic Min', blues: 'Blues', wholeTone: 'Whole Tone',
    japanese: '都節 (Miyako)', hirajoshi: '平調子 (Hira)',
};

const ALL_SCALE_NAMES: ScaleName[] = Object.keys(SCALE_INTERVALS) as ScaleName[];

// ─── Chord system ───────────────────────────────────────────────────────────
const CHORD_TYPES = {
    open5: [0, 4],
    minor7: [0, 2, 4, 6],
    add9: [0, 2, 4, 6, 1],
    sus4: [0, 3, 4],
    aug: [0, 2, 3, 5],
    maj7: [0, 2, 4, 6],
    dim7: [0, 2, 3, 5],
    dom7: [0, 2, 4, 5],
};
type ChordType = keyof typeof CHORD_TYPES;

// Chord progressions for different CA phases
type CAPhase = 'sparse' | 'growing' | 'chaotic' | 'declining' | 'stable';
const PHASE_PROGRESSIONS: Record<CAPhase, { chords: ChordType[]; roots: number[] }> = {
    sparse: { chords: ['open5', 'minor7', 'open5', 'sus4'], roots: [0, 4, 0, 3] },
    growing: { chords: ['maj7', 'dom7', 'add9', 'maj7'], roots: [0, 3, 4, 0] },
    stable: { chords: ['minor7', 'add9', 'minor7', 'sus4'], roots: [0, 2, 4, 3] },
    chaotic: { chords: ['aug', 'dim7', 'sus4', 'dom7'], roots: [0, 1, 3, 4] },
    declining: { chords: ['sus4', 'minor7', 'open5', 'minor7'], roots: [4, 3, 0, 2] },
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function midiToNote(midi: number): string {
    return Tone.Frequency(Math.max(24, Math.min(108, midi)), 'midi').toNote();
}
function smooth(current: number, target: number, alpha: number): number {
    return current + (target - current) * alpha;
}
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

// ─── Markov melody probability table ────────────────────────────────────────
// Maps "stability" (0=chaotic, 1=stable) to probability of interval jumps
function markovNextInterval(prevInterval: number, stability: number): number {
    const r = Math.random();
    if (stability > 0.7) {
        // Stable: step-wise motion (2nd, 3rd)
        if (r < 0.4) return prevInterval + (Math.random() < 0.5 ? 1 : -1);
        if (r < 0.7) return prevInterval + (Math.random() < 0.5 ? 2 : -2);
        return prevInterval; // repeat
    } else if (stability > 0.3) {
        // Medium: mix of steps and leaps
        if (r < 0.25) return prevInterval + (Math.random() < 0.5 ? 1 : -1);
        if (r < 0.5) return prevInterval + (Math.random() < 0.5 ? 2 : -2);
        if (r < 0.7) return prevInterval + (Math.random() < 0.5 ? 3 : -3);
        if (r < 0.85) return prevInterval + (Math.random() < 0.5 ? 4 : -4);
        return prevInterval + (Math.random() < 0.5 ? 5 : -5);
    } else {
        // Chaotic: large leaps (5th, 7th, octave)
        if (r < 0.2) return prevInterval + (Math.random() < 0.5 ? 4 : -4);
        if (r < 0.45) return prevInterval + (Math.random() < 0.5 ? 5 : -5);
        if (r < 0.65) return prevInterval + (Math.random() < 0.5 ? 6 : -6);
        if (r < 0.8) return prevInterval + (Math.random() < 0.5 ? 7 : -7);
        return Math.floor(Math.random() * 14) - 7; // wild jump
    }
}

// ─── Main engine ────────────────────────────────────────────────────────────
export class AudioEngine {
    // Synths
    private melodySynth: Tone.PolySynth;
    private bassSynth: Tone.MonoSynth;
    private padSynth: Tone.PolySynth;

    // Drum kit
    private kickSynth: Tone.MembraneSynth;
    private snareSynth: Tone.NoiseSynth;
    private hihatSynth: Tone.NoiseSynth;
    private clapSynth: Tone.NoiseSynth;
    private cymbalSynth: Tone.MetalSynth;

    // Effects chain
    private melodyVol: Tone.Volume;
    private bassVol: Tone.Volume;
    private melodyPanner: Tone.Panner;
    private reverb: Tone.Reverb;
    private delay: Tone.FeedbackDelay;
    private mainFilter: Tone.Filter;
    private compressor: Tone.Compressor;
    private chorus: Tone.Chorus;
    private distortion: Tone.Distortion;

    // State
    private currentScale: ScaleName = 'pentatonic';
    private isInitialized = false;
    private stepIndex = 0;
    private generationCount = 0;

    // CA-driven metrics (smoothed)
    private smoothedRootDegree = 0;
    private smoothedDensity = 0;
    private smoothedChurnRate = 0;
    private smoothedClusters = 0;
    private smoothedSymmetry = 0;
    private smoothedMelodyRatio = 0.33;
    private smoothedBassRatio = 0.33;
    private prevBirthCenterX = 0.5;
    private prevBirthCenterY = 0.5;
    private smoothedCenterX = 0.5;

    // Phase detection
    private currentPhase: CAPhase = 'sparse';
    private phaseStepCounter = 0;
    private progressionIndex = 0;

    // Markov melody state
    private lastMelodyScaleIndex = 0;
    private motifBuffer: number[] = [];         // remembered note sequence
    private motifDensitySnapshot = 0;           // density when motif was captured
    private motifRecordedAt = 0;

    // Chord
    private currentChordType: ChordType = 'minor7';
    private currentRootMidi = 48;
    private displayChordName = '';

    // Birth buffer
    private birthBuffer: Array<{ x: number; y: number; color: number }> = [];
    private deathBuffer: Array<{ x: number; y: number }> = [];

    // Grid dimensions
    private gridWidth: number;
    private gridHeight: number;
    private prevGrid: Float32Array;

    // Arpeggio
    private _pendingArpeggioDir: 'up' | 'down' = 'up';
    private _pendingArpeggioCount = 0;

    // Rhythm pattern from CA rows (8-step)
    private rhythmKick: boolean[] = new Array(8).fill(false);
    private rhythmSnare: boolean[] = new Array(8).fill(false);
    private rhythmHihat: boolean[] = new Array(8).fill(false);
    private rhythmPerc: boolean[] = new Array(8).fill(false);

    // Density history for section detection
    private densityHistory: number[] = [];
    private peakDensityEver = 0;

    // Auto modulation
    private lastModulationGen = 0;
    private autoModulateEnabled = true;

    private loop: Tone.Loop | null = null;

    constructor(gridWidth: number, gridHeight: number) {
        this.gridWidth = gridWidth;
        this.gridHeight = gridHeight;
        this.prevGrid = new Float32Array(gridWidth * gridHeight * 2);

        // Effects chain
        this.compressor = new Tone.Compressor({ threshold: -24, ratio: 4, attack: 0.003, release: 0.25 });
        this.mainFilter = new Tone.Filter({ frequency: 5000, type: 'lowpass', rolloff: -24 });
        this.reverb = new Tone.Reverb({ decay: 2.2, wet: 0.32, preDelay: 0.01 });
        this.delay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.2, wet: 0.22 });
        this.chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.3, wet: 0 }).start();
        this.distortion = new Tone.Distortion({ distortion: 0, wet: 0 });

        this.delay.connect(this.reverb);
        this.reverb.connect(this.chorus);
        this.chorus.connect(this.distortion);
        this.distortion.connect(this.mainFilter);
        this.mainFilter.connect(this.compressor);
        this.compressor.toDestination();

        // Melody with panning
        this.melodyPanner = new Tone.Panner(0).connect(this.delay);
        this.melodyVol = new Tone.Volume(0).connect(this.melodyPanner);
        this.bassVol = new Tone.Volume(0).connect(this.reverb);

        // Melody synth
        this.melodySynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.005, decay: 0.35, sustain: 0.05, release: 0.9 },
        });
        this.melodySynth.volume.value = -8;
        this.melodySynth.connect(this.melodyVol);

        // Bass
        this.bassSynth = new Tone.MonoSynth({
            oscillator: { type: 'sawtooth' },
            filter: { frequency: 500, type: 'lowpass', rolloff: -12 },
            envelope: { attack: 0.05, decay: 0.3, sustain: 0.2, release: 0.6 },
        });
        this.bassSynth.volume.value = -12;
        this.bassSynth.connect(this.bassVol);

        // Pad
        this.padSynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sine' },
            envelope: { attack: 1.5, decay: 1.0, sustain: 0.6, release: 3.0 },
        });
        this.padSynth.volume.value = -22;
        this.padSynth.connect(this.reverb);

        // ── Drum kit ──────────────────────────────────────────────────────────
        this.kickSynth = new Tone.MembraneSynth({
            pitchDecay: 0.05,
            octaves: 6,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.4 },
        });
        this.kickSynth.volume.value = -14;
        this.kickSynth.connect(this.compressor);

        this.snareSynth = new Tone.NoiseSynth({
            noise: { type: 'white' },
            envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.12 },
        });
        this.snareSynth.volume.value = -18;
        this.snareSynth.connect(this.compressor);

        this.hihatSynth = new Tone.NoiseSynth({
            noise: { type: 'white' },
            envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.04 },
        });
        this.hihatSynth.volume.value = -26;
        this.hihatSynth.connect(this.compressor);

        this.clapSynth = new Tone.NoiseSynth({
            noise: { type: 'pink' },
            envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.15 },
        });
        this.clapSynth.volume.value = -20;
        this.clapSynth.connect(this.compressor);

        this.cymbalSynth = new Tone.MetalSynth({
            envelope: { attack: 0.001, decay: 0.6, release: 0.3 },
            harmonicity: 5.1,
            modulationIndex: 16,
            resonance: 4000,
            octaves: 1.5,
        });
        this.cymbalSynth.volume.value = -28;
        this.cymbalSynth.connect(this.reverb);

        Tone.Destination.volume.value = -6;
    }

    public async initialize() {
        if (this.isInitialized) return;
        await Tone.start();
        Tone.Transport.bpm.value = 100;
        Tone.Transport.start();

        this.loop = new Tone.Loop((time) => { this.onMusicalStep(time); }, '8n');
        this.loop.start(0);

        // Pad chord every 4 measures
        Tone.Transport.scheduleRepeat((time) => { this.triggerPadChord(time + 0.05); }, '4m');
        this.triggerPadChord(Tone.now() + 0.3);
        this.isInitialized = true;
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  PAD CHORD
    // ═════════════════════════════════════════════════════════════════════════
    private triggerPadChord(time: number) {
        const intervals = SCALE_INTERVALS[this.currentScale];
        const chordDegrees = CHORD_TYPES[this.currentChordType];
        const chordNotes = chordDegrees.map(deg => {
            const scaleIdx = deg % intervals.length;
            const octaveOffset = Math.floor(deg / intervals.length) * 12;
            return midiToNote(this.currentRootMidi + intervals[scaleIdx] + octaveOffset);
        });
        this.padSynth.triggerAttackRelease(chordNotes, '4m', time, 0.28);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  PROCESS GRID — runs every animation frame
    // ═════════════════════════════════════════════════════════════════════════
    public processGrid(grid: Float32Array, width: number, height: number, channels: number, _timeDelta: number) {
        if (!this.isInitialized) return;
        this.generationCount++;

        // ── Compute CA metrics ─────────────────────────────────────────────
        let totalAlive = 0;
        let sumX = 0, sumY = 0;
        let leftAlive = 0, rightAlive = 0;
        const zoneAlive = [0, 0, 0];
        let birthSumX = 0, birthSumY = 0, birthCount = 0;
        let deathCount = 0;

        const BLOCK = 8;
        const blocksX = Math.ceil(width / BLOCK);
        const blocksY = Math.ceil(height / BLOCK);
        const blockActive = new Uint8Array(blocksX * blocksY);

        const MELODY_CUTOFF = height * 0.4;
        const BASS_CUTOFF = height * 0.7;
        const midX = width / 2;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * channels;
                const prev = this.prevGrid[idx];
                const curr = grid[idx];

                if (curr > 0.5) {
                    totalAlive++;
                    sumX += x; sumY += y;
                    if (x < midX) leftAlive++; else rightAlive++;
                    if (y < MELODY_CUTOFF) zoneAlive[0]++;
                    else if (y < BASS_CUTOFF) zoneAlive[1]++;
                    else zoneAlive[2]++;

                    const bx = Math.floor(x / BLOCK);
                    const by = Math.floor(y / BLOCK);
                    blockActive[by * blocksX + bx] = 1;
                }
                if (prev < 0.4 && curr > 0.6) {
                    this.birthBuffer.push({ x, y, color: grid[idx + 1] });
                    birthSumX += x; birthSumY += y; birthCount++;
                }
                if (prev > 0.6 && curr < 0.4) {
                    deathCount++;
                    this.deathBuffer.push({ x, y });
                }
            }
        }

        this.prevGrid.set(grid);

        // Extract rhythm patterns from specific grid rows
        this.extractRhythmFromGrid(grid, width, height, channels);

        // Derived metrics
        const densityRatio = totalAlive / (width * height);
        const centerX = totalAlive > 0 ? sumX / totalAlive / width : 0.5;
        const symmetry = totalAlive > 0
            ? 1.0 - Math.abs(leftAlive - rightAlive) / totalAlive
            : 0.5;
        const churnRate = totalAlive > 0
            ? Math.min(1, (birthCount + deathCount) / totalAlive)
            : 0;
        let activeClusters = 0;
        for (let i = 0; i < blockActive.length; i++) if (blockActive[i]) activeClusters++;
        const clusterRatio = activeClusters / blockActive.length;

        const birthCenterX = birthCount > 0 ? birthSumX / birthCount / width : 0.5;
        const birthCenterY = birthCount > 0 ? birthSumY / birthCount / height : 0.5;

        // Track density history for song structure
        this.densityHistory.push(densityRatio);
        if (this.densityHistory.length > 200) this.densityHistory.shift();
        this.peakDensityEver = Math.max(this.peakDensityEver, densityRatio);

        this.updateMusicalParameters({
            densityRatio, centerX, symmetry, churnRate, clusterRatio,
            zoneRatioMelody: totalAlive > 0 ? zoneAlive[0] / totalAlive : 0.33,
            zoneRatioBass: totalAlive > 0 ? zoneAlive[2] / totalAlive : 0.33,
            birthCenterX, birthCenterY, birthCount, deathCount,
        });

        // Auto-modulation: every ~120 generations, potentially change scale/key
        if (this.autoModulateEnabled && this.generationCount - this.lastModulationGen > 120) {
            this.autoModulate();
            this.lastModulationGen = this.generationCount;
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  EXTRACT RHYTHM PATTERN FROM CA ROWS
    // ═════════════════════════════════════════════════════════════════════════
    private extractRhythmFromGrid(grid: Float32Array, width: number, height: number, channels: number) {
        // Sample 4 specific rows for kick/snare/hihat/perc
        const rows = [
            Math.floor(height * 0.8),   // kick row (bass zone)
            Math.floor(height * 0.55),  // snare row (mid zone)
            Math.floor(height * 0.2),   // hihat row (melody zone)
            Math.floor(height * 0.4),   // percussion row (boundary)
        ];
        const targets = [this.rhythmKick, this.rhythmSnare, this.rhythmHihat, this.rhythmPerc];

        for (let r = 0; r < 4; r++) {
            const y = rows[r];
            const stepWidth = Math.floor(width / 8);
            for (let s = 0; s < 8; s++) {
                // Check if any cell in this segment is alive
                let alive = 0;
                for (let x = s * stepWidth; x < (s + 1) * stepWidth && x < width; x++) {
                    const idx = (y * width + x) * channels;
                    if (grid[idx] > 0.5) alive++;
                }
                targets[r][s] = alive > stepWidth * 0.3; // threshold
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  AUTO-MODULATE (scale/key changes based on CA state)
    // ═════════════════════════════════════════════════════════════════════════
    private autoModulate() {
        const density = this.smoothedDensity;
        const churn = this.smoothedChurnRate;
        const sym = this.smoothedSymmetry;

        // Pick a new scale influenced by the CA state
        const hash = Math.floor((density * 1000 + churn * 777 + sym * 333 + this.generationCount * 13) % ALL_SCALE_NAMES.length);
        const newScale = ALL_SCALE_NAMES[hash];

        // Only change if different
        if (newScale !== this.currentScale) {
            this.currentScale = newScale;
        }

        // Shift root by up to a 5th based on symmetry
        const rootShift = Math.floor(sym * 7) - 3; // -3 to +4 semitones
        this.currentRootMidi = clamp(48 + rootShift, 36, 60);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  UPDATE MUSICAL PARAMETERS
    // ═════════════════════════════════════════════════════════════════════════
    private updateMusicalParameters(m: {
        densityRatio: number; centerX: number; symmetry: number;
        churnRate: number; clusterRatio: number;
        zoneRatioMelody: number; zoneRatioBass: number;
        birthCenterX: number; birthCenterY: number;
        birthCount: number; deathCount: number;
    }) {
        const intervals = SCALE_INTERVALS[this.currentScale];

        // ── Root note from center-of-mass X ────────────────────────────────
        const targetRootDegree = m.centerX * (intervals.length - 1);
        this.smoothedRootDegree = smooth(this.smoothedRootDegree, targetRootDegree, 0.04);
        const rootIdx = Math.round(this.smoothedRootDegree) % intervals.length;
        this.currentRootMidi = 48 + intervals[rootIdx];

        // ── Smooth metrics ─────────────────────────────────────────────────
        this.smoothedDensity = smooth(this.smoothedDensity, m.densityRatio, 0.06);
        this.smoothedChurnRate = smooth(this.smoothedChurnRate, m.churnRate, 0.08);
        this.smoothedSymmetry = smooth(this.smoothedSymmetry, m.symmetry, 0.05);
        this.smoothedClusters = smooth(this.smoothedClusters, m.clusterRatio, 0.05);
        this.smoothedCenterX = smooth(this.smoothedCenterX, m.centerX, 0.08);

        const density = this.smoothedDensity;
        const churn = this.smoothedChurnRate;
        const sym = this.smoothedSymmetry;

        // ── Phase detection ────────────────────────────────────────────────
        let newPhase: CAPhase;
        if (density < 0.03) {
            newPhase = 'sparse';
        } else if (churn > 0.5) {
            newPhase = 'chaotic';
        } else if (this.densityHistory.length > 10) {
            const recentAvg = this.densityHistory.slice(-10).reduce((a, b) => a + b, 0) / 10;
            const olderAvg = this.densityHistory.length > 20
                ? this.densityHistory.slice(-20, -10).reduce((a, b) => a + b, 0) / 10
                : recentAvg;
            if (recentAvg > olderAvg * 1.15) newPhase = 'growing';
            else if (recentAvg < olderAvg * 0.85) newPhase = 'declining';
            else newPhase = 'stable';
        } else {
            newPhase = density < 0.1 ? 'sparse' : 'stable';
        }

        if (newPhase !== this.currentPhase) {
            this.currentPhase = newPhase;
            this.progressionIndex = 0;
        }

        // ── Chord from progression ─────────────────────────────────────────
        this.phaseStepCounter++;
        if (this.phaseStepCounter >= 32) { // advance chord every ~32 steps
            this.phaseStepCounter = 0;
            this.progressionIndex = (this.progressionIndex + 1) % 4;
        }

        const prog = PHASE_PROGRESSIONS[this.currentPhase];
        this.currentChordType = prog.chords[this.progressionIndex];
        const progRoot = prog.roots[this.progressionIndex];
        const progRootSemitone = intervals[progRoot % intervals.length] ?? 0;
        // Blend CA-driven root with progression root
        this.currentRootMidi = 48 + Math.round((intervals[rootIdx] + progRootSemitone) / 2);

        // ── Zone dynamics ──────────────────────────────────────────────────
        this.smoothedMelodyRatio = smooth(this.smoothedMelodyRatio, m.zoneRatioMelody, 0.05);
        this.smoothedBassRatio = smooth(this.smoothedBassRatio, m.zoneRatioBass, 0.05);
        const melodyDb = Math.max(-12, Math.min(4, -8 + this.smoothedMelodyRatio * 15));
        const bassDb = Math.max(-12, Math.min(4, -8 + this.smoothedBassRatio * 15));
        this.melodyVol.volume.rampTo(melodyDb, 0.5);
        this.bassVol.volume.rampTo(bassDb, 0.5);

        // ── Spatial panning from birth center X ────────────────────────────
        const pan = clamp((this.smoothedCenterX - 0.5) * 1.6, -0.8, 0.8);
        this.melodyPanner.pan.rampTo(pan, 0.3);

        // ── Dynamic effects from CA ────────────────────────────────────────
        // Reverb: stable = more spacious
        const stabilityWet = 0.2 + (1 - Math.min(1, churn * 2)) * 0.25;
        this.reverb.wet.rampTo(stabilityWet, 1.0);

        // Chorus: high symmetry = more chorus
        const chorusWet = sym > 0.7 ? 0.3 + (sym - 0.7) * 1.0 : 0;
        this.chorus.wet.rampTo(chorusWet, 1.0);

        // Distortion: extreme churn
        const distWet = churn > 0.6 ? (churn - 0.6) * 0.5 : 0;
        this.distortion.wet.rampTo(distWet, 0.5);
        this.distortion.distortion = distWet > 0 ? 0.15 : 0;

        // Filter: density opens the filter
        const filterFreq = 2000 + density * 8000;
        this.mainFilter.frequency.rampTo(filterFreq, 0.5);

        // Delay feedback: more clusters = more echo
        const delayFb = 0.15 + Math.min(0.35, this.smoothedClusters * 0.5);
        this.delay.feedback.rampTo(delayFb, 0.5);

        // ── Display chord name ─────────────────────────────────────────────
        const rootName = Tone.Frequency(this.currentRootMidi, 'midi').toNote().replace(/\d/, '');
        const label: Record<ChordType, string> = {
            open5: '5', minor7: 'm7', add9: 'm9', sus4: 'sus4', aug: 'aug',
            maj7: 'M7', dim7: 'dim7', dom7: '7',
        };
        const phaseEmoji: Record<CAPhase, string> = {
            sparse: '🌑', growing: '🌱', stable: '🌿', chaotic: '🔥', declining: '🌙',
        };
        this.displayChordName = `${rootName}${label[this.currentChordType]}  ·  ${SCALE_LABELS[this.currentScale]}  ·  ${phaseEmoji[this.currentPhase]} ${this.currentPhase}`;

        // ── Movement arpeggio ──────────────────────────────────────────────
        const dx = m.birthCenterX - this.prevBirthCenterX;
        const dy = m.birthCenterY - this.prevBirthCenterY;
        if (Math.sqrt(dx * dx + dy * dy) > 0.15 && m.birthCount > 3) {
            this._pendingArpeggioDir = dy < 0 ? 'up' : 'down';
            this._pendingArpeggioCount = 3;
        }
        this.prevBirthCenterX = smooth(this.prevBirthCenterX, m.birthCenterX, 0.15);
        this.prevBirthCenterY = smooth(this.prevBirthCenterY, m.birthCenterY, 0.15);

        // ── Motif capture ──────────────────────────────────────────────────
        if (this.motifBuffer.length === 0 && m.birthCount > 5 && this.generationCount > 10) {
            // Will be filled in onMusicalStep
            this.motifDensitySnapshot = density;
            this.motifRecordedAt = this.generationCount;
        }

        // Detect collision burst: lots of deaths + births together = accent
        if (m.deathCount > 15 && m.birthCount > 10) {
            this._collisionPending = true;
        }
    }

    private _collisionPending = false;

    // ═════════════════════════════════════════════════════════════════════════
    //  MUSICAL STEP — fires every 8th note
    // ═════════════════════════════════════════════════════════════════════════
    private onMusicalStep(time: number) {
        const births = [...this.birthBuffer];
        this.birthBuffer = [];
        const deaths = [...this.deathBuffer];
        this.deathBuffer = [];

        const intervals = SCALE_INTERVALS[this.currentScale];
        const chordDegrees = CHORD_TYPES[this.currentChordType];
        const step8 = this.stepIndex % 8;

        // Build note pool from current chord + scale
        const melodyNotes = chordDegrees.flatMap(deg => {
            const base = intervals[deg % intervals.length] ?? 0;
            return [midiToNote(this.currentRootMidi + base + 12), midiToNote(this.currentRootMidi + base + 24)];
        });
        const bassNotes = [
            midiToNote(this.currentRootMidi - 12),
            midiToNote(this.currentRootMidi - 12 + (intervals[2 % intervals.length] ?? 7)),
            midiToNote(this.currentRootMidi - 12 + (intervals[4 % intervals.length] ?? 7)),
        ];

        const height = this.gridHeight;
        const melodyBirths = births.filter(b => b.y < height * 0.4);
        const harmonyBirths = births.filter(b => b.y >= height * 0.4 && b.y < height * 0.7);
        const bassBirths = births.filter(b => b.y >= height * 0.7);

        // Stability drives note duration
        const stability = 1 - Math.min(1, this.smoothedChurnRate * 1.5);
        const durationPool: Tone.Unit.Time[] = stability > 0.7
            ? ['4n', '4n', '2n', '4n.']
            : stability > 0.4
                ? ['8n', '4n', '8n.', '8n']
                : ['16n', '8n', '16n', '8n.'];

        // Density drives note chance
        const density = Math.min(1, this.smoothedClusters * 3);
        const noteChance = 0.3 + density * 0.7;

        // Song structure: adjust intensity
        const sectionIntensity = this.getSectionIntensity();

        // ── Collision accent ──────────────────────────────────────────────
        if (this._collisionPending) {
            this._collisionPending = false;
            // Cymbal crash
            this.cymbalSynth.triggerAttackRelease('16n', time, 0.5);
            // Glissando: rapid ascending notes
            for (let i = 0; i < 4; i++) {
                const note = midiToNote(this.currentRootMidi + 12 + i * 3);
                this.melodySynth.triggerAttackRelease(note, '32n', time + i * 0.04, 0.4);
            }
        }

        // ── Drum kit from CA rhythm patterns ──────────────────────────────
        if (sectionIntensity > 0.2) {
            // Kick
            if (this.rhythmKick[step8]) {
                this.kickSynth.triggerAttackRelease('C1', '8n', time, 0.6 * sectionIntensity);
            }
            // Snare
            if (this.rhythmSnare[step8] && sectionIntensity > 0.4) {
                this.snareSynth.triggerAttackRelease('16n', time, 0.4 * sectionIntensity);
            }
            // Hihat from CA
            if (this.rhythmHihat[step8]) {
                this.hihatSynth.triggerAttackRelease('32n', time, 0.25 * sectionIntensity);
            }
            // Perc / Clap from CA
            if (this.rhythmPerc[step8] && sectionIntensity > 0.5) {
                this.clapSynth.triggerAttackRelease('16n', time, 0.3 * sectionIntensity);
            }
        }

        // Fallback: minimal kick on beats 0,4 when density exists but no pattern
        if (!this.rhythmKick[step8] && (step8 === 0 || step8 === 4) && this.smoothedDensity > 0.02) {
            this.kickSynth.triggerAttackRelease('C1', '8n', time, 0.25 * sectionIntensity);
        }

        // ── Arpeggio from movement ────────────────────────────────────────
        if (this._pendingArpeggioCount > 0) {
            const arpIdx = this._pendingArpeggioDir === 'up'
                ? (3 - this._pendingArpeggioCount)
                : this._pendingArpeggioCount - 1;
            this.melodySynth.triggerAttackRelease(
                melodyNotes[arpIdx % melodyNotes.length], '16n', time + 0.01, 0.5
            );
            this._pendingArpeggioCount--;
        }
        // ── Markov melody ─────────────────────────────────────────────────
        else if (melodyBirths.length > 0 && Math.random() < noteChance) {
            const nextIdx = markovNextInterval(this.lastMelodyScaleIndex, stability);
            // Constrain to valid scale range (2 octaves)
            const constrainedIdx = ((nextIdx % (intervals.length * 2)) + intervals.length * 2) % (intervals.length * 2);
            const octave = Math.floor(constrainedIdx / intervals.length);
            const scalePos = constrainedIdx % intervals.length;
            const midi = this.currentRootMidi + 12 + intervals[scalePos] + (octave * 12);
            const note = midiToNote(midi);

            const duration = durationPool[this.stepIndex % durationPool.length];
            const birth = melodyBirths[Math.floor(Math.random() * Math.min(melodyBirths.length, 3))];
            const velocity = clamp(0.3 + birth.color * 0.4 + sectionIntensity * 0.2, 0.2, 0.85);

            this.melodySynth.triggerAttackRelease(note, duration, time + 0.01, velocity);
            this.lastMelodyScaleIndex = constrainedIdx;

            // Record motif if buffer is building
            if (this.motifBuffer.length < 8 && this.generationCount - this.motifRecordedAt < 50) {
                this.motifBuffer.push(midi);
            }
        }
        // ── Motif recall: when density returns to a similar state ──────────
        else if (this.motifBuffer.length >= 4 &&
            Math.abs(this.smoothedDensity - this.motifDensitySnapshot) < 0.05 &&
            this.generationCount - this.motifRecordedAt > 200 &&
            Math.random() < 0.3) {
            // Replay the motif with variation
            const motifNote = this.motifBuffer[this.stepIndex % this.motifBuffer.length];
            const variation = Math.random() < 0.3 ? (Math.random() < 0.5 ? 1 : -1) : 0;
            const note = midiToNote(motifNote + variation);
            this.melodySynth.triggerAttackRelease(note, '8n', time + 0.01, 0.4);
        }

        // ── Harmony (call & response: right side births) ──────────────────
        if (harmonyBirths.length > 2 && this.stepIndex % 4 === 0 && Math.random() < noteChance * 0.7) {
            const birth = harmonyBirths[Math.floor(Math.random() * Math.min(harmonyBirths.length, 3))];
            // Use birth X position for left/right response
            const isRightSide = birth.x > this.gridWidth / 2;
            const noteOffset = isRightSide ? 2 : 0; // right side responds higher
            const noteIdx = Math.max(0, Math.floor((1 - birth.color) * melodyNotes.length * 0.5)) + noteOffset;
            const duration = durationPool[this.stepIndex % durationPool.length];
            this.melodySynth.triggerAttackRelease(
                melodyNotes[clamp(noteIdx, 0, melodyNotes.length - 1)],
                duration, time + 0.005, 0.22
            );
        }

        // ── Bass ──────────────────────────────────────────────────────────
        if (bassBirths.length > 0 && this.stepIndex % 2 === 0 && Math.random() < noteChance) {
            const note = bassNotes[this.stepIndex % bassNotes.length];
            const velocity = clamp(0.4 + Math.min(bassBirths.length * 0.04, 0.3) + sectionIntensity * 0.15, 0.2, 0.8);
            this.bassSynth.triggerAttackRelease(note, '8n', time, velocity);
        }

        // ── Mass death event = break/drop ─────────────────────────────────
        if (deaths.length > 30 && births.length < 5) {
            // Sudden silence — break effect (reduce volume momentarily)
            this.melodyVol.volume.rampTo(-20, 0.1);
            this.bassVol.volume.rampTo(-20, 0.1);
            // Recover after a beat
            setTimeout(() => {
                this.melodyVol.volume.rampTo(0, 0.5);
                this.bassVol.volume.rampTo(0, 0.5);
            }, 500);
        }

        this.stepIndex++;
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  SONG STRUCTURE — returns 0..1 intensity
    // ═════════════════════════════════════════════════════════════════════════
    private getSectionIntensity(): number {
        if (this.generationCount < 30) {
            // Intro: gradually build
            return 0.3 + (this.generationCount / 30) * 0.3;
        }
        if (this.peakDensityEver > 0 && this.smoothedDensity < this.peakDensityEver * 0.1) {
            // Outro / near-death: minimal
            return 0.2;
        }
        // Normal: scale with density
        return clamp(0.4 + this.smoothedDensity * 3.0, 0.3, 1.0);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  PUBLIC API
    // ═════════════════════════════════════════════════════════════════════════
    public setBpm(bpm: number) {
        if (this.isInitialized) Tone.Transport.bpm.rampTo(bpm, 1.0);
    }

    public setScale(scale: ScaleName) {
        this.currentScale = scale;
        this.autoModulateEnabled = false; // user chose manually, disable auto
    }

    public enableAutoModulate(enabled: boolean) {
        this.autoModulateEnabled = enabled;
    }

    public setPreset(preset: SynthPresetName) {
        if (preset === 'pluck') {
            this.melodySynth.set({ oscillator: { type: 'triangle' } as any, envelope: { attack: 0.005, decay: 0.35, sustain: 0.05, release: 0.9 } });
            this.mainFilter.frequency.rampTo(5000, 0.5);
            this.delay.wet.rampTo(0.22, 0.5);
        } else if (preset === 'crystal') {
            this.melodySynth.set({ oscillator: { type: 'sine' } as any, envelope: { attack: 0.02, decay: 0.8, sustain: 0.05, release: 1.5 } });
            this.mainFilter.frequency.rampTo(9000, 0.5);
            this.delay.wet.rampTo(0.38, 0.5);
        } else if (preset === 'pad') {
            this.melodySynth.set({ oscillator: { type: 'sine' } as any, envelope: { attack: 0.6, decay: 1.0, sustain: 0.5, release: 2.5 } });
            this.mainFilter.frequency.rampTo(2500, 0.5);
            this.delay.wet.rampTo(0.15, 0.5);
        } else if (preset === 'fmbell') {
            this.melodySynth.set({ oscillator: { type: 'fmsine' } as any, envelope: { attack: 0.001, decay: 1.2, sustain: 0.0, release: 1.8 } });
            this.mainFilter.frequency.rampTo(7000, 0.5);
            this.delay.wet.rampTo(0.35, 0.5);
        } else if (preset === 'bitcrush') {
            this.melodySynth.set({ oscillator: { type: 'square' } as any, envelope: { attack: 0.001, decay: 0.15, sustain: 0.1, release: 0.3 } });
            this.mainFilter.frequency.rampTo(3000, 0.5);
            this.delay.wet.rampTo(0.1, 0.5);
        } else if (preset === 'strings') {
            this.melodySynth.set({ oscillator: { type: 'sawtooth' } as any, envelope: { attack: 0.3, decay: 0.8, sustain: 0.6, release: 2.0 } });
            this.mainFilter.frequency.rampTo(4000, 0.5);
            this.delay.wet.rampTo(0.18, 0.5);
        } else if (preset === 'marimba') {
            this.melodySynth.set({ oscillator: { type: 'sine' } as any, envelope: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.5 } });
            this.mainFilter.frequency.rampTo(6000, 0.5);
            this.delay.wet.rampTo(0.28, 0.5);
        }
    }

    public setBassPreset(preset: BassPresetName) {
        if (preset === 'sawtooth') {
            this.bassSynth.set({
                oscillator: { type: 'sawtooth' } as any,
                filter: { frequency: 500, type: 'lowpass' } as any,
                envelope: { attack: 0.05, decay: 0.3, sustain: 0.2, release: 0.6 },
            });
            this.bassSynth.volume.value = -12;
        } else if (preset === 'sub') {
            this.bassSynth.set({
                oscillator: { type: 'sine' } as any,
                filter: { frequency: 200, type: 'lowpass' } as any,
                envelope: { attack: 0.01, decay: 0.5, sustain: 0.5, release: 0.8 },
            });
            this.bassSynth.volume.value = -8;
        } else if (preset === 'pluck') {
            this.bassSynth.set({
                oscillator: { type: 'triangle' } as any,
                filter: { frequency: 800, type: 'lowpass' } as any,
                envelope: { attack: 0.005, decay: 0.15, sustain: 0.0, release: 0.3 },
            });
            this.bassSynth.volume.value = -10;
        } else if (preset === 'upright') {
            this.bassSynth.set({
                oscillator: { type: 'sine' } as any,
                filter: { frequency: 1200, type: 'lowpass' } as any,
                envelope: { attack: 0.04, decay: 0.6, sustain: 0.3, release: 1.0 },
            });
            this.bassSynth.volume.value = -11;
        }
    }

    public getCurrentChordName(): string {
        return this.displayChordName || '';
    }
}
