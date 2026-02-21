import { useEffect, useRef, useState, useCallback } from 'react';
import { NCAEngine } from './engine/NCAEngine';
import { AudioEngine, type SynthPresetName, type ScaleName } from './engine/AudioEngine';
import { GridCanvas } from './components/GridCanvas';
import { Controls } from './components/Controls';
import { Volume2 } from 'lucide-react';

const GRID_SIZE = 64;
const CANVAS_SIZE = 800;

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<SynthPresetName>('pluck');
  const [currentScale, setCurrentScale] = useState<ScaleName>('pentatonic');
  const [mutationRate, setMutationRate] = useState<number>(3);
  const [bpm, setBpm] = useState<number>(100);
  const [currentChordName, setCurrentChordName] = useState<string>('');

  const engineRef = useRef<NCAEngine | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);

  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Initialize Engines
  useEffect(() => {
    engineRef.current = new NCAEngine(GRID_SIZE, GRID_SIZE);
    audioRef.current = new AudioEngine(GRID_SIZE, GRID_SIZE);

    // Seed with an R-pentomino in the center for interesting initial behavior
    engineRef.current.insertRPentomino(GRID_SIZE / 2, GRID_SIZE / 2, 0.6);
    engineRef.current.insertGlider(GRID_SIZE / 4, GRID_SIZE / 4, 0.3);
    engineRef.current.insertGlider(GRID_SIZE * 3 / 4, GRID_SIZE / 3, 0.8);

    return () => {
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const animate = useCallback((time: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = time;
    const deltaTime = (time - lastTimeRef.current) / 1000;

    if (isPlaying && engineRef.current && audioRef.current && deltaTime > 0.05) {
      lastTimeRef.current = time;

      // Auto-mutate: inject gliders instead of random noise for musical traveling patterns
      if (mutationRate > 0) {
        if (Math.random() < mutationRate * 0.02) {
          const color = Math.random();
          const r = Math.random();
          if (r < 0.5) {
            engineRef.current.insertGlider(
              Math.floor(Math.random() * GRID_SIZE),
              Math.floor(Math.random() * GRID_SIZE),
              color
            );
          } else if (r < 0.8) {
            engineRef.current.insertSpaceship(
              Math.floor(Math.random() * GRID_SIZE),
              Math.floor(Math.random() * GRID_SIZE),
              color
            );
          } else {
            engineRef.current.insertRPentomino(
              Math.floor(Math.random() * GRID_SIZE),
              Math.floor(Math.random() * GRID_SIZE),
              color
            );
          }
        }
      }

      engineRef.current.step();

      const grid = engineRef.current.getCurrentGrid();
      if (hasStarted) {
        audioRef.current.processGrid(grid, GRID_SIZE, GRID_SIZE, 2, deltaTime);
        const newChord = audioRef.current.getCurrentChordName();
        if (newChord !== currentChordName) {
          setCurrentChordName(newChord);
        }
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
      engineRef.current.insertRPentomino(GRID_SIZE / 2, GRID_SIZE / 2, 0.6);
    }
  };

  const randomizeGrid = async () => {
    await startAudio();
    engineRef.current?.randomize();
    if (!isPlaying) setIsPlaying(true);
  };

  const handleInteract = async (x: number, y: number) => {
    await startAudio();
    if (!isPlaying) setIsPlaying(true);
    if (engineRef.current) {
      const r = Math.random();
      if (r < 0.4) {
        engineRef.current.insertPattern(Math.min(x, GRID_SIZE - 1), Math.min(y, GRID_SIZE - 1), 3);
      } else {
        engineRef.current.insertGlider(Math.min(x, GRID_SIZE - 3), Math.min(y, GRID_SIZE - 3), Math.random());
      }
    }
  };

  const handlePresetChange = async (preset: SynthPresetName) => {
    setCurrentPreset(preset);
    await startAudio();
    audioRef.current?.setPreset(preset);
    if (!isPlaying) setIsPlaying(true);
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

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 md:p-6 text-slate-200">
      <div className="max-w-4xl w-full flex flex-col items-center gap-6">

        <div className="text-center space-y-2 mt-2">
          <h1 className="text-4xl md:text-5xl font-extrabold font-heading tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-fuchsia-400 to-indigo-400">
            Neural Soundscape
          </h1>
          <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed">
            Draw on the grid and let the cellular automaton compose music.
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
              {!hasStarted && (
                <div className="absolute inset-0 bg-black/75 flex items-center justify-center backdrop-blur-md pointer-events-none">
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-4 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 animate-bounce">
                      <Volume2 size={32} />
                    </div>
                    <p className="text-white text-base font-medium tracking-wide">
                      Click anywhere on the grid or press Play to begin
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
          mutationRate={mutationRate}
          bpm={bpm}
          currentChordName={currentChordName}
          onTogglePlay={togglePlay}
          onReset={resetGrid}
          onRandomize={randomizeGrid}
          onChangePreset={handlePresetChange}
          onChangeScale={handleScaleChange}
          onChangeMutationRate={setMutationRate}
          onChangeBpm={handleBpmChange}
        />

      </div>
    </div>
  );
}

export default App;
