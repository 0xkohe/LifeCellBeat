import { useEffect, useRef, useState, useCallback } from 'react';
import { NCAEngine } from './engine/NCAEngine';
import { AudioEngine, type SynthPresetName, type ScaleName, type BassPresetName } from './engine/AudioEngine';
import { GridCanvas } from './components/GridCanvas';
import { Controls } from './components/Controls';
import { Volume2 } from 'lucide-react';

const GRID_SIZE = 64;
const CANVAS_SIZE = 800;

export type StampType = 'draw' | 'glider' | 'blinker' | 'lwss' | 'rpento';

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<SynthPresetName>('pluck');
  const [currentScale, setCurrentScale] = useState<ScaleName>('pentatonic');
  const [bassPreset, setBassPreset] = useState<BassPresetName>('sawtooth');
  const [mutationRate, setMutationRate] = useState<number>(0);
  const [bpm, setBpm] = useState<number>(100);
  const [currentChordName, setCurrentChordName] = useState<string>('');
  const [stampType, setStampType] = useState<StampType>('draw');

  const engineRef = useRef<NCAEngine | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    engineRef.current = new NCAEngine(GRID_SIZE, GRID_SIZE);
    audioRef.current = new AudioEngine(GRID_SIZE, GRID_SIZE);
    return () => { cancelAnimationFrame(requestRef.current); };
  }, []);

  const animate = useCallback((time: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = time;
    const deltaTime = (time - lastTimeRef.current) / 1000;

    if (isPlaying && engineRef.current && audioRef.current && deltaTime > 0.05) {
      lastTimeRef.current = time;

      // Auto-seed: inject diverse patterns (default off, user controls)
      if (mutationRate > 0 && Math.random() < mutationRate * 0.015) {
        const r = Math.random();
        const color = Math.random();
        const x = Math.floor(Math.random() * (GRID_SIZE - 5));
        const y = Math.floor(Math.random() * (GRID_SIZE - 5));
        if (r < 0.4) engineRef.current.insertGlider(x, y, color);
        else if (r < 0.7) engineRef.current.insertSpaceship(x, y, color);
        else engineRef.current.insertRPentomino(x, y, color);
      }

      engineRef.current.step();
      const grid = engineRef.current.getCurrentGrid();
      if (hasStarted) {
        audioRef.current.processGrid(grid, GRID_SIZE, GRID_SIZE, 2, deltaTime);
        const newChord = audioRef.current.getCurrentChordName();
        if (newChord !== currentChordName) setCurrentChordName(newChord);
      }
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [isPlaying, hasStarted, mutationRate, currentChordName]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [animate]);

  const startAudio = async () => {
    if (!hasStarted && audioRef.current) {
      await audioRef.current.initialize();
      audioRef.current.setPreset(currentPreset);
      audioRef.current.setScale(currentScale);
      audioRef.current.setBassPreset(bassPreset);
      audioRef.current.setBpm(bpm);
      setHasStarted(true);
      setCurrentChordName(audioRef.current.getCurrentChordName());
    }
  };

  const togglePlay = async () => {
    await startAudio();
    setIsPlaying(prev => !prev);
  };

  const resetGrid = () => {
    if (engineRef.current) {
      engineRef.current = new NCAEngine(GRID_SIZE, GRID_SIZE);
    }
    setIsPlaying(false);
  };

  /** Place a diverse mix of patterns across a 3×3 grid partition */
  const generatePattern = () => {
    if (!engineRef.current) return;
    // Clear first
    engineRef.current = new NCAEngine(GRID_SIZE, GRID_SIZE);

    const patterns = [
      (x: number, y: number, c: number) => engineRef.current!.insertGlider(x, y, c),
      (x: number, y: number, c: number) => engineRef.current!.insertSpaceship(x, y, c),
      (x: number, y: number, c: number) => engineRef.current!.insertRPentomino(x, y, c),
      (x: number, y: number, c: number) => engineRef.current!.insertPattern(x, y, 3),
    ];

    // Place 1–2 patterns in each of 9 grid sectors
    const sectorSize = GRID_SIZE / 3;
    for (let sy = 0; sy < 3; sy++) {
      for (let sx = 0; sx < 3; sx++) {
        const count = Math.random() < 0.4 ? 2 : 1;
        for (let _c = 0; _c < count; _c++) {
          const px = Math.floor(sx * sectorSize + Math.random() * (sectorSize - 6));
          const py = Math.floor(sy * sectorSize + Math.random() * (sectorSize - 6));
          const fn = patterns[Math.floor(Math.random() * patterns.length)];
          fn(px, py, (sx + sy * 3) / 8); // color by sector position
        }
      }
    }
  };

  const handleInteract = async (x: number, y: number) => {
    await startAudio();
    if (!isPlaying) setIsPlaying(true);
    if (!engineRef.current) return;

    const color = Math.random();
    const cx = Math.min(x, GRID_SIZE - 5);
    const cy = Math.min(y, GRID_SIZE - 5);

    switch (stampType) {
      case 'glider':
        engineRef.current.insertGlider(cx, cy, color);
        break;
      case 'blinker':
        // Place a classic blinker (3-cell horizontal line = oscillator)
        engineRef.current.insertBlinker(cx, cy, color);
        break;
      case 'lwss':
        engineRef.current.insertSpaceship(cx, cy, color);
        break;
      case 'rpento':
        engineRef.current.insertRPentomino(cx, cy, color);
        break;
      case 'draw':
      default:
        engineRef.current.insertPattern(cx, cy, 2);
        break;
    }
  };

  const handleBassPresetChange = async (preset: BassPresetName) => {
    setBassPreset(preset);
    await startAudio();
    audioRef.current?.setBassPreset(preset);
  };

  const handlePresetChange = async (preset: SynthPresetName) => {
    setCurrentPreset(preset);
    await startAudio();
    audioRef.current?.setPreset(preset);
  };

  const handleScaleChange = async (scale: ScaleName) => {
    setCurrentScale(scale);
    await startAudio();
    audioRef.current?.setScale(scale);
  };

  const handleBpmChange = (newBpm: number) => {
    setBpm(newBpm);
    audioRef.current?.setBpm(newBpm);
  };

  const isEmpty = !hasStarted && !isPlaying;

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 md:p-6 text-slate-200">
      <div className="max-w-4xl w-full flex flex-col items-center gap-5">

        <div className="text-center space-y-1.5 mt-2">
          <h1 className="text-4xl md:text-5xl font-extrabold font-heading tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-fuchsia-400 to-indigo-400">
            Neural Soundscape
          </h1>
          <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed">
            Place patterns on the grid, then press Play to hear the automaton compose.
          </p>
        </div>

        {engineRef.current && (
          <div className="relative rounded-2xl p-1.5 bg-gradient-to-b from-white/10 to-white/5 border border-white/5 shadow-2xl">
            <div className="absolute inset-0 bg-violet-600/10 blur-3xl -z-10 rounded-full pointer-events-none"></div>
            <div className="rounded-xl overflow-hidden bg-black/70 relative border border-white/10">
              <GridCanvas
                engine={engineRef.current}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                gridSize={GRID_SIZE}
                onInteract={handleInteract}
              />
              {isEmpty && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm pointer-events-none">
                  <div className="flex flex-col items-center gap-3 text-center px-6">
                    <div className="p-4 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                      <Volume2 size={28} />
                    </div>
                    <p className="text-white/80 text-sm font-medium">
                      Draw on the grid or click <strong>Generate</strong> to place patterns,<br />
                      then press <strong>Play</strong> to start the music.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <Controls
          isPlaying={isPlaying}
          currentPreset={currentPreset}
          currentScale={currentScale}
          bassPreset={bassPreset}
          mutationRate={mutationRate}
          bpm={bpm}
          currentChordName={currentChordName}
          stampType={stampType}
          onTogglePlay={togglePlay}
          onReset={resetGrid}
          onGenerate={generatePattern}
          onChangePreset={handlePresetChange}
          onChangeScale={handleScaleChange}
          onChangeBassPreset={handleBassPresetChange}
          onChangeMutationRate={setMutationRate}
          onChangeBpm={handleBpmChange}
          onChangeStamp={setStampType}
        />

      </div>
    </div>
  );
}

export default App;
