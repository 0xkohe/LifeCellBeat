import * as Tone from 'tone';

export type SynthPresetName = 'pluck' | 'crystal' | 'pad';
export type ScaleName = 'pentatonic' | 'minor' | 'major' | 'dorian';

// Scale intervals in semitones from root
const SCALE_INTERVALS: Record<ScaleName, number[]> = {
    pentatonic: [0, 3, 5, 7, 10],
    minor: [0, 2, 3, 5, 7, 8, 10],
    major: [0, 2, 4, 5, 7, 9, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
};

const SCALE_LABELS: Record<ScaleName, string> = {
    pentatonic: 'C Pentatonic',
    minor: 'C Natural Minor',
    major: 'C Major',
    dorian: 'C Dorian',
};

// Build playable note array from MIDI root across multiple octaves
function buildScale(intervals: number[], rootMidi: number, octaves: number): string[] {
    const notes: string[] = [];
    for (let oct = 0; oct < octaves; oct++) {
        for (const interval of intervals) {
            const midi = rootMidi + oct * 12 + interval;
            if (midi >= 24 && midi <= 108) {
                notes.push(Tone.Frequency(midi, 'midi').toNote());
            }
        }
    }
    return notes;
}

// Chord roots (MIDI) for a simple 4-chord progression in C
const CHORD_ROOTS = [
    { name: 'C Min', rootMidi: 48 },
    { name: 'Ab Maj', rootMidi: 44 },
    { name: 'Eb Maj', rootMidi: 51 },
    { name: 'G Min', rootMidi: 55 },
];

export class AudioEngine {
    // Synths
    private melodySynth: Tone.PolySynth;
    private bassSynth: Tone.MonoSynth;
    private padSynth: Tone.PolySynth;
    private hihatSynth: Tone.NoiseSynth;

    // Effects
    private reverb: Tone.Reverb;
    private delay: Tone.FeedbackDelay;
    private mainFilter: Tone.Filter;
    private compressor: Tone.Compressor;

    // State
    private currentPreset: SynthPresetName = 'pluck';
    private currentScale: ScaleName = 'pentatonic';
    private isInitialized = false;
    private chordIndex = 0;
    private stepIndex = 0;

    // Grid state
    private gridWidth: number;
    private gridHeight: number;
    private prevGrid: Float32Array;
    // Birth events since last musical step: [y position, color weight]
    private birthBuffer: Array<{ x: number; y: number; color: number }> = [];

    private loop: Tone.Loop | null = null;

    constructor(gridWidth: number, gridHeight: number) {
        this.gridWidth = gridWidth;
        this.gridHeight = gridHeight;
        this.prevGrid = new Float32Array(gridWidth * gridHeight * 2);

        // --- Effect chain ---
        this.compressor = new Tone.Compressor({ threshold: -24, ratio: 4, attack: 0.003, release: 0.25 });
        this.mainFilter = new Tone.Filter({ frequency: 5000, type: 'lowpass', rolloff: -24 });
        this.reverb = new Tone.Reverb({ decay: 2.0, wet: 0.35, preDelay: 0.01 });
        this.delay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.2, wet: 0.25 });

        // Routing: effects -> compressor -> destination
        this.delay.connect(this.reverb);
        this.reverb.connect(this.mainFilter);
        this.mainFilter.connect(this.compressor);
        this.compressor.toDestination();

        // --- Melody Synth (pluck/marimba character) ---
        this.melodySynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.005, decay: 0.35, sustain: 0.05, release: 0.9 },
        });
        this.melodySynth.volume.value = -8;
        this.melodySynth.connect(this.delay);

        // --- Bass Synth ---
        this.bassSynth = new Tone.MonoSynth({
            oscillator: { type: 'sawtooth' },
            filter: { frequency: 500, type: 'lowpass', rolloff: -12 },
            envelope: { attack: 0.05, decay: 0.3, sustain: 0.2, release: 0.6 },
        });
        this.bassSynth.volume.value = -12;
        this.bassSynth.connect(this.reverb);

        // --- Pad Synth (background atmosphere) ---
        this.padSynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sine' },
            envelope: { attack: 1.5, decay: 1.0, sustain: 0.6, release: 3.0 },
        });
        this.padSynth.volume.value = -22;
        this.padSynth.connect(this.reverb);

        // --- Hi-hat (rhythm texture) ---
        this.hihatSynth = new Tone.NoiseSynth({
            noise: { type: 'white' },
            envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.04 },
        });
        this.hihatSynth.volume.value = -28;
        this.hihatSynth.connect(this.compressor);

        // Master volume
        Tone.Destination.volume.value = -6;
    }

    public async initialize() {
        if (this.isInitialized) return;
        await Tone.start();

        Tone.Transport.bpm.value = 100;
        Tone.Transport.start();

        // Musical sequencer loop — fires every 8th note
        this.loop = new Tone.Loop((time) => {
            this.onMusicalStep(time);
        }, '8n');
        this.loop.start(0);

        // Chord change every 4 bars
        Tone.Transport.scheduleRepeat((time) => {
            this.chordIndex = (this.chordIndex + 1) % CHORD_ROOTS.length;
            this.triggerPadChord(time + 0.05);
        }, '4m');

        // Initial pad chord
        this.triggerPadChord(Tone.now() + 0.3);

        this.isInitialized = true;
        console.log('Audio Engine v2 Initialized');
    }

    private triggerPadChord(time: number) {
        const root = CHORD_ROOTS[this.chordIndex].rootMidi;
        const scale = buildScale(SCALE_INTERVALS[this.currentScale], root, 2);
        // Play 1st, 3rd, 5th notes as pad chord (very quiet atmosphere)
        const chordNotes = [scale[0], scale[2], scale[4]].filter(Boolean);
        if (chordNotes.length > 0) {
            this.padSynth.triggerAttackRelease(chordNotes, '4m', time, 0.3);
        }
    }

    // Called every animation frame from App.tsx
    public processGrid(grid: Float32Array, width: number, height: number, channels: number, _timeDelta: number) {
        if (!this.isInitialized) return;

        // Detect birth events (dead → alive transitions)
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * channels;
                const prevActive = this.prevGrid[idx];
                const currActive = grid[idx];
                // Birth: was below threshold, now above
                if (prevActive < 0.4 && currActive > 0.6) {
                    this.birthBuffer.push({ x, y, color: grid[idx + 1] });
                }
            }
        }

        // Snapshot for chord tracking
        this.prevGrid.set(grid);
    }

    private onMusicalStep(time: number) {
        const births = [...this.birthBuffer];
        this.birthBuffer = [];

        const height = this.gridHeight;
        const root = CHORD_ROOTS[this.chordIndex].rootMidi;
        const intervals = SCALE_INTERVALS[this.currentScale];

        // Build note arrays for each zone
        const melodyNotes = buildScale(intervals, root + 12, 3); // octave up
        const harmonyNotes = buildScale(intervals, root + 5, 2); // mid range
        const bassNotes = buildScale(intervals, root - 12, 2);   // bass range

        // Zone splits
        const melodyZone = height * 0.4;
        const bassZone = height * 0.7;

        const melodyBirths = births.filter(b => b.y < melodyZone);
        const harmonyBirths = births.filter(b => b.y >= melodyZone && b.y < bassZone);
        const bassBirths = births.filter(b => b.y >= bassZone);

        // ---- MELODY (top zone): 1 note per step, only when births exist ----
        if (melodyBirths.length > 0) {
            // Pick a random birth from the top few to keep it varied
            const birth = melodyBirths[Math.floor(Math.random() * Math.min(melodyBirths.length, 4))];
            const relY = 1.0 - (birth.y / melodyZone); // invert: top = higher pitch
            // Map y position to note index in upper part of scale
            const noteIdx = Math.floor(relY * melodyNotes.length * 0.8 + melodyNotes.length * 0.1);
            const note = melodyNotes[Math.max(0, Math.min(melodyNotes.length - 1, noteIdx))];

            const velocity = 0.45 + birth.color * 0.3;
            // Vary duration: shorter when many births (busy), longer when sparse
            const durations = ['16n', '8n', '8n', '4n', '8n.'];
            const duration = durations[Math.floor(this.stepIndex % durations.length)];

            this.melodySynth.triggerAttackRelease(note, duration, time + 0.01, velocity);

            // Hi-hat on dense melody activity (adds rhythmic texture)
            if (melodyBirths.length > 4 && this.stepIndex % 2 === 0) {
                this.hihatSynth.triggerAttackRelease('16n', time, 0.5);
            }
        }

        // ---- HARMONY (middle zone): every 2–4 steps ----
        if (harmonyBirths.length > 2 && this.stepIndex % 3 === 0) {
            const birth = harmonyBirths[Math.floor(Math.random() * Math.min(harmonyBirths.length, 3))];
            const relY = 1.0 - ((birth.y - melodyZone) / (bassZone - melodyZone));
            const noteIdx = Math.floor(relY * harmonyNotes.length * 0.6);
            const note = harmonyNotes[Math.max(0, Math.min(harmonyNotes.length - 1, noteIdx))];
            this.melodySynth.triggerAttackRelease(note, '4n', time + 0.005, 0.28);
        }

        // ---- BASS (bottom zone): on even 8th-note beats when active ----
        if (bassBirths.length > 0 && this.stepIndex % 2 === 0) {
            const note = bassNotes[0]; // root note of chord
            const velocity = 0.5 + Math.min(bassBirths.length * 0.05, 0.3);
            this.bassSynth.triggerAttackRelease(note, '8n', time, velocity);
        }

        // ---- Kick hi-hat on beat 1 of every 4 steps (keeps pulse) ----
        if (this.stepIndex % 8 === 0) {
            this.hihatSynth.triggerAttackRelease('16n', time, 0.4);
        }

        this.stepIndex++;
    }

    public setBpm(bpm: number) {
        if (this.isInitialized) {
            Tone.Transport.bpm.rampTo(bpm, 1.0);
        }
    }

    public setScale(scale: ScaleName) {
        this.currentScale = scale;
    }

    public setPreset(preset: SynthPresetName) {
        this.currentPreset = preset;
        this.applyPreset();
    }

    private applyPreset() {
        if (this.currentPreset === 'pluck') {
            this.melodySynth.set({
                oscillator: { type: 'triangle' } as any,
                envelope: { attack: 0.005, decay: 0.35, sustain: 0.05, release: 0.9 },
            });
            this.mainFilter.frequency.rampTo(5000, 0.5);
            this.delay.wet.rampTo(0.25, 0.5);
        } else if (this.currentPreset === 'crystal') {
            this.melodySynth.set({
                oscillator: { type: 'sine' } as any,
                envelope: { attack: 0.02, decay: 0.8, sustain: 0.05, release: 1.5 },
            });
            this.mainFilter.frequency.rampTo(9000, 0.5);
            this.delay.wet.rampTo(0.4, 0.5);
        } else if (this.currentPreset === 'pad') {
            this.melodySynth.set({
                oscillator: { type: 'sine' } as any,
                envelope: { attack: 0.6, decay: 1.0, sustain: 0.5, release: 2.5 },
            });
            this.mainFilter.frequency.rampTo(2500, 0.5);
            this.delay.wet.rampTo(0.15, 0.5);
        }
    }

    public getCurrentChordName(): string {
        return CHORD_ROOTS[this.chordIndex].name + ' / ' + SCALE_LABELS[this.currentScale];
    }
}
