import * as Tone from 'tone';

export type SynthPresetName = 'pluck' | 'crystal' | 'pad';
export type ScaleName = 'pentatonic' | 'minor' | 'major' | 'dorian';

const SCALE_INTERVALS: Record<ScaleName, number[]> = {
    pentatonic: [0, 3, 5, 7, 10],
    minor: [0, 2, 3, 5, 7, 8, 10],
    major: [0, 2, 4, 5, 7, 9, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
};

const SCALE_LABELS: Record<ScaleName, string> = {
    pentatonic: 'Pentatonic', minor: 'Minor', major: 'Major', dorian: 'Dorian',
};

const CHORD_TYPES = {
    open5: [0, 4],
    minor7: [0, 2, 4, 6],
    add9: [0, 2, 4, 6, 1],
    sus4: [0, 3, 4],
    aug: [0, 2, 3, 5], // more dissonant for high chaos
};
type ChordType = keyof typeof CHORD_TYPES;

function midiToNote(midi: number): string {
    return Tone.Frequency(Math.max(24, Math.min(108, midi)), 'midi').toNote();
}
function smooth(current: number, target: number, alpha: number): number {
    return current + (target - current) * alpha;
}

export class AudioEngine {
    private melodySynth: Tone.PolySynth;
    private bassSynth: Tone.MonoSynth;
    private padSynth: Tone.PolySynth;
    private hihatSynth: Tone.NoiseSynth;
    private melodyVol: Tone.Volume;
    private bassVol: Tone.Volume;
    private reverb: Tone.Reverb;
    private delay: Tone.FeedbackDelay;
    private mainFilter: Tone.Filter;
    private compressor: Tone.Compressor;

    private currentScale: ScaleName = 'pentatonic';
    private isInitialized = false;
    private stepIndex = 0;

    // CA-driven parameters (all smoothed with EMA)
    private smoothedRootDegree = 0;
    private smoothedDensity = 0;
    private smoothedChurnRate = 0;    // births+deaths / alive
    private smoothedClusters = 0;     // active 8×8 block count
    private smoothedSymmetry = 0;     // 0=asymmetric, 1=symmetric
    private smoothedMelodyRatio = 0.33;
    private smoothedBassRatio = 0.33;
    private prevBirthCenterX = 0.5;
    private prevBirthCenterY = 0.5;

    private currentChordType: ChordType = 'minor7';
    private currentRootMidi = 48;
    private displayChordName = '';

    private birthBuffer: Array<{ x: number; y: number; color: number }> = [];
    private gridWidth: number;
    private gridHeight: number;
    private prevGrid: Float32Array;

    private _pendingArpeggioDir: 'up' | 'down' = 'up';
    private _pendingArpeggioCount = 0;

    private loop: Tone.Loop | null = null;

    constructor(gridWidth: number, gridHeight: number) {
        this.gridWidth = gridWidth;
        this.gridHeight = gridHeight;
        this.prevGrid = new Float32Array(gridWidth * gridHeight * 2);

        this.compressor = new Tone.Compressor({ threshold: -24, ratio: 4, attack: 0.003, release: 0.25 });
        this.mainFilter = new Tone.Filter({ frequency: 5000, type: 'lowpass', rolloff: -24 });
        this.reverb = new Tone.Reverb({ decay: 2.2, wet: 0.32, preDelay: 0.01 });
        this.delay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.2, wet: 0.22 });

        this.delay.connect(this.reverb);
        this.reverb.connect(this.mainFilter);
        this.mainFilter.connect(this.compressor);
        this.compressor.toDestination();

        this.melodyVol = new Tone.Volume(0).connect(this.delay);
        this.bassVol = new Tone.Volume(0).connect(this.reverb);

        this.melodySynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.005, decay: 0.35, sustain: 0.05, release: 0.9 },
        });
        this.melodySynth.volume.value = -8;
        this.melodySynth.connect(this.melodyVol);

        this.bassSynth = new Tone.MonoSynth({
            oscillator: { type: 'sawtooth' },
            filter: { frequency: 500, type: 'lowpass', rolloff: -12 },
            envelope: { attack: 0.05, decay: 0.3, sustain: 0.2, release: 0.6 },
        });
        this.bassSynth.volume.value = -12;
        this.bassSynth.connect(this.bassVol);

        this.padSynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sine' },
            envelope: { attack: 1.5, decay: 1.0, sustain: 0.6, release: 3.0 },
        });
        this.padSynth.volume.value = -22;
        this.padSynth.connect(this.reverb);

        this.hihatSynth = new Tone.NoiseSynth({
            noise: { type: 'white' },
            envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.04 },
        });
        this.hihatSynth.volume.value = -30;
        this.hihatSynth.connect(this.compressor);

        Tone.Destination.volume.value = -6;
    }

    public async initialize() {
        if (this.isInitialized) return;
        await Tone.start();
        Tone.Transport.bpm.value = 100;
        Tone.Transport.start();

        this.loop = new Tone.Loop((time) => { this.onMusicalStep(time); }, '8n');
        this.loop.start(0);

        Tone.Transport.scheduleRepeat((time) => { this.triggerPadChord(time + 0.05); }, '4m');
        this.triggerPadChord(Tone.now() + 0.3);
        this.isInitialized = true;
    }

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

    public processGrid(grid: Float32Array, width: number, height: number, channels: number, _timeDelta: number) {
        if (!this.isInitialized) return;

        // ── Compute all CA metrics ─────────────────────────────────────────────
        let totalAlive = 0;
        let sumX = 0, sumY = 0;
        let leftAlive = 0, rightAlive = 0;
        let zoneAlive = [0, 0, 0];
        let birthSumX = 0, birthSumY = 0, birthCount = 0;
        let deathCount = 0;

        // 8×8 block activity map for cluster counting
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

                    // Mark 8×8 block as active
                    const bx = Math.floor(x / BLOCK);
                    const by = Math.floor(y / BLOCK);
                    blockActive[by * blocksX + bx] = 1;
                }
                if (prev < 0.4 && curr > 0.6) {
                    this.birthBuffer.push({ x, y, color: grid[idx + 1] });
                    birthSumX += x; birthSumY += y; birthCount++;
                }
                if (prev > 0.6 && curr < 0.4) deathCount++;
            }
        }

        this.prevGrid.set(grid);

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
        const clusterRatio = activeClusters / blockActive.length; // 0–1

        const birthCenterX = birthCount > 0 ? birthSumX / birthCount / width : 0.5;
        const birthCenterY = birthCount > 0 ? birthSumY / birthCount / height : 0.5;

        this.updateMusicalParameters({
            densityRatio, centerX, symmetry, churnRate, clusterRatio,
            zoneRatioMelody: totalAlive > 0 ? zoneAlive[0] / totalAlive : 0.33,
            zoneRatioBass: totalAlive > 0 ? zoneAlive[2] / totalAlive : 0.33,
            birthCenterX, birthCenterY, birthCount,
        });

    }

    private updateMusicalParameters(m: {
        densityRatio: number; centerX: number; symmetry: number;
        churnRate: number; clusterRatio: number;
        zoneRatioMelody: number; zoneRatioBass: number;
        birthCenterX: number; birthCenterY: number; birthCount: number;
    }) {
        const intervals = SCALE_INTERVALS[this.currentScale];

        // ── Root note from center-of-mass X ────────────────────────────────────
        const targetRootDegree = m.centerX * (intervals.length - 1);
        this.smoothedRootDegree = smooth(this.smoothedRootDegree, targetRootDegree, 0.04);
        const rootIdx = Math.round(this.smoothedRootDegree) % intervals.length;
        this.currentRootMidi = 48 + intervals[rootIdx];

        // ── Chord type: combined density + churn + symmetry ────────────────────
        this.smoothedDensity = smooth(this.smoothedDensity, m.densityRatio, 0.06);
        this.smoothedChurnRate = smooth(this.smoothedChurnRate, m.churnRate, 0.08);
        this.smoothedSymmetry = smooth(this.smoothedSymmetry, m.symmetry, 0.05);
        this.smoothedClusters = smooth(this.smoothedClusters, m.clusterRatio, 0.05);

        const density = this.smoothedDensity;
        const churn = this.smoothedChurnRate;
        const sym = this.smoothedSymmetry;

        let chordType: ChordType;
        if (churn > 0.6) {
            // Very chaotic: dissonant
            chordType = sym > 0.7 ? 'aug' : 'sus4';
        } else if (density < 0.07) {
            chordType = 'open5';         // very sparse = hollow
        } else if (churn < 0.15 && density < 0.3) {
            // Stable and quiet: mellow m7
            chordType = 'minor7';
        } else if (density > 0.45 || churn > 0.35) {
            chordType = sym > 0.6 ? 'add9' : 'sus4';
        } else {
            chordType = 'add9';
        }
        this.currentChordType = chordType;

        // ── Zone dynamics ───────────────────────────────────────────────────────
        this.smoothedMelodyRatio = smooth(this.smoothedMelodyRatio, m.zoneRatioMelody, 0.05);
        this.smoothedBassRatio = smooth(this.smoothedBassRatio, m.zoneRatioBass, 0.05);
        const melodyDb = Math.max(-12, Math.min(4, -8 + this.smoothedMelodyRatio * 15));
        const bassDb = Math.max(-12, Math.min(4, -8 + this.smoothedBassRatio * 15));
        this.melodyVol.volume.rampTo(melodyDb, 0.5);
        this.bassVol.volume.rampTo(bassDb, 0.5);

        // ── Reverb wet from stability: stable = wetter (more spacious) ─────────
        const stabilityWet = 0.2 + (1 - Math.min(1, churn * 2)) * 0.25;
        this.reverb.wet.rampTo(stabilityWet, 1.0);

        // ── Display chord name ──────────────────────────────────────────────────
        const rootName = Tone.Frequency(this.currentRootMidi, 'midi').toNote().replace(/\d/, '');
        const label: Record<ChordType, string> = {
            open5: '5', minor7: 'm7', add9: 'm9', sus4: 'sus4', aug: 'aug'
        };
        const clusters = Math.round(this.smoothedClusters * blockCount(this.gridWidth, this.gridHeight));
        this.displayChordName = `${rootName}${label[chordType]}  ·  ${SCALE_LABELS[this.currentScale]}  ·  ${clusters} clusters`;

        // ── Movement arpeggio ───────────────────────────────────────────────────
        const dx = m.birthCenterX - this.prevBirthCenterX;
        const dy = m.birthCenterY - this.prevBirthCenterY;
        if (Math.sqrt(dx * dx + dy * dy) > 0.15 && m.birthCount > 3) {
            this._pendingArpeggioDir = dy < 0 ? 'up' : 'down';
            this._pendingArpeggioCount = 3;
        }
        this.prevBirthCenterX = smooth(this.prevBirthCenterX, m.birthCenterX, 0.15);
        this.prevBirthCenterY = smooth(this.prevBirthCenterY, m.birthCenterY, 0.15);
    }

    private onMusicalStep(time: number) {
        const births = [...this.birthBuffer];
        this.birthBuffer = [];

        const intervals = SCALE_INTERVALS[this.currentScale];
        const chordDegrees = CHORD_TYPES[this.currentChordType];

        // Build note lists from CA-driven root
        const melodyNotes = chordDegrees.flatMap(deg => {
            const base = intervals[deg % intervals.length] ?? 0;
            return [midiToNote(this.currentRootMidi + base + 12), midiToNote(this.currentRootMidi + base + 24)];
        });
        const bassNotes = [midiToNote(this.currentRootMidi - 12), midiToNote(this.currentRootMidi - 12 + (intervals[2] ?? 7))];

        const height = this.gridHeight;
        const melodyBirths = births.filter(b => b.y < height * 0.4);
        const harmonyBirths = births.filter(b => b.y >= height * 0.4 && b.y < height * 0.7);
        const bassBirths = births.filter(b => b.y >= height * 0.7);

        // Cluster ratio drives note density — denser clusters = more notes
        const density = Math.min(1, this.smoothedClusters * 3);
        const noteChance = 0.3 + density * 0.7;
        // Stability (inverse churn) drives note duration
        const stability = 1 - Math.min(1, this.smoothedChurnRate * 1.5);
        const durationPool: Tone.Unit.Time[] = stability > 0.7
            ? ['4n', '4n', '2n', '4n.']     // stable → long notes
            : ['8n', '16n', '8n', '8n.'];   // chaotic → short staccato

        // ── Arpeggio from movement ────────────────────────────────────────────
        if (this._pendingArpeggioCount > 0) {
            const arpIdx = this._pendingArpeggioDir === 'up'
                ? (3 - this._pendingArpeggioCount)
                : this._pendingArpeggioCount - 1;
            this.melodySynth.triggerAttackRelease(
                melodyNotes[arpIdx % melodyNotes.length], '16n', time + 0.01, 0.5
            );
            this._pendingArpeggioCount--;
        }
        // ── Melody ────────────────────────────────────────────────────────────
        else if (melodyBirths.length > 0 && Math.random() < noteChance) {
            const birth = melodyBirths[Math.floor(Math.random() * Math.min(melodyBirths.length, 3))];
            const relY = 1.0 - (birth.y / (height * 0.4));
            const noteIdx = Math.max(0, Math.min(melodyNotes.length - 1, Math.floor(relY * melodyNotes.length)));
            const duration = durationPool[this.stepIndex % durationPool.length];
            const velocity = 0.4 + birth.color * 0.35;
            this.melodySynth.triggerAttackRelease(melodyNotes[noteIdx], duration, time + 0.01, velocity);

            if (melodyBirths.length > 5 && this.stepIndex % 2 === 0) {
                this.hihatSynth.triggerAttackRelease('16n', time, 0.45);
            }
        }

        // ── Harmony ───────────────────────────────────────────────────────────
        if (harmonyBirths.length > 2 && this.stepIndex % 4 === 0 && Math.random() < noteChance * 0.7) {
            const birth = harmonyBirths[Math.floor(Math.random() * Math.min(harmonyBirths.length, 3))];
            const noteIdx = Math.max(0, Math.floor((1 - birth.color) * melodyNotes.length * 0.5));
            const duration = durationPool[this.stepIndex % durationPool.length];
            this.melodySynth.triggerAttackRelease(melodyNotes[noteIdx], duration, time + 0.005, 0.22);
        }

        // ── Bass ──────────────────────────────────────────────────────────────
        if (bassBirths.length > 0 && this.stepIndex % 2 === 0 && Math.random() < noteChance) {
            const note = bassNotes[this.stepIndex % bassNotes.length];
            const velocity = 0.5 + Math.min(bassBirths.length * 0.04, 0.3);
            this.bassSynth.triggerAttackRelease(note, '8n', time, velocity);
        }

        if (this.stepIndex % 8 === 0) {
            this.hihatSynth.triggerAttackRelease('32n', time, 0.3);
        }
        this.stepIndex++;
    }

    public setBpm(bpm: number) {
        if (this.isInitialized) Tone.Transport.bpm.rampTo(bpm, 1.0);
    }
    public setScale(scale: ScaleName) { this.currentScale = scale; }

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
        }
    }

    public getCurrentChordName(): string {
        return this.displayChordName || '';
    }
}

function blockCount(w: number, h: number) {
    return Math.ceil(w / 8) * Math.ceil(h / 8);
}
