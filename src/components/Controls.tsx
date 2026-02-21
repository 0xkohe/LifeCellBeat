import { Play, Pause, RefreshCw, Sparkles, SlidersHorizontal, Music } from 'lucide-react';
import type { SynthPresetName, ScaleName } from '../engine/AudioEngine';

interface ControlsProps {
    isPlaying: boolean;
    currentPreset: SynthPresetName;
    currentScale: ScaleName;
    mutationRate: number;
    bpm: number;
    currentChordName: string;
    onTogglePlay: () => void;
    onReset: () => void;
    onRandomize: () => void;
    onChangePreset: (preset: SynthPresetName) => void;
    onChangeScale: (scale: ScaleName) => void;
    onChangeMutationRate: (rate: number) => void;
    onChangeBpm: (bpm: number) => void;
}

export const Controls = ({
    isPlaying,
    currentPreset,
    currentScale,
    mutationRate,
    bpm,
    currentChordName,
    onTogglePlay,
    onReset,
    onRandomize,
    onChangePreset,
    onChangeScale,
    onChangeMutationRate,
    onChangeBpm,
}: ControlsProps) => {
    return (
        <div className="flex flex-col gap-4 bg-white/[0.03] p-5 rounded-2xl border border-white/[0.08] backdrop-blur-xl w-full max-w-[800px] shadow-2xl relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"></div>

            {/* Top row: play controls + chord display */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                        onClick={onTogglePlay}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all duration-300 shadow-lg text-sm shrink-0 ${isPlaying
                                ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 shadow-indigo-500/25'
                            }`}
                    >
                        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                        <span className="font-heading tracking-wide">{isPlaying ? 'Pause' : 'Play'}</span>
                    </button>

                    <button
                        onClick={onRandomize}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-medium transition-all border border-white/5 hover:border-white/10 text-sm shrink-0"
                        title="Randomize Grid"
                    >
                        <Sparkles size={16} className="text-amber-300" />
                        <span>Randomize</span>
                    </button>

                    <button
                        onClick={onReset}
                        className="flex items-center justify-center w-10 h-10 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl transition-all border border-white/5 hover:border-white/10 shrink-0 group"
                        title="Reset Grid"
                    >
                        <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-500 text-rose-300" />
                    </button>
                </div>

                {isPlaying && currentChordName && (
                    <div className="px-4 py-2 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-300 font-mono text-xs flex items-center gap-2.5 shrink-0">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </span>
                        <span className="font-heading tracking-wider">{currentChordName}</span>
                    </div>
                )}
            </div>

            {/* Bottom rows: synth controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-white/[0.06]">

                {/* Left column */}
                <div className="flex flex-col gap-3">
                    {/* Timbre */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0">
                            <SlidersHorizontal size={15} className="text-violet-400" />
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                            <label className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mb-1">Timbre</label>
                            <select
                                value={currentPreset}
                                onChange={(e) => onChangePreset(e.target.value as SynthPresetName)}
                                className="bg-black/30 text-slate-200 text-xs font-medium rounded-lg px-2 py-1.5 border border-white/10 focus:outline-none focus:border-indigo-500/50 cursor-pointer w-full"
                            >
                                <option value="pluck" className="bg-slate-900">Pluck / Marimba</option>
                                <option value="crystal" className="bg-slate-900">Crystal / Bells</option>
                                <option value="pad" className="bg-slate-900">Soft Pad</option>
                            </select>
                        </div>
                    </div>

                    {/* Scale */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-fuchsia-500/20 flex items-center justify-center shrink-0">
                            <Music size={15} className="text-fuchsia-400" />
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                            <label className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mb-1">Scale</label>
                            <select
                                value={currentScale}
                                onChange={(e) => onChangeScale(e.target.value as ScaleName)}
                                className="bg-black/30 text-slate-200 text-xs font-medium rounded-lg px-2 py-1.5 border border-white/10 focus:outline-none focus:border-fuchsia-500/50 cursor-pointer w-full"
                            >
                                <option value="pentatonic" className="bg-slate-900">Pentatonic Minor</option>
                                <option value="minor" className="bg-slate-900">Natural Minor</option>
                                <option value="major" className="bg-slate-900">Major</option>
                                <option value="dorian" className="bg-slate-900">Dorian</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Right column */}
                <div className="flex flex-col gap-4 justify-center">
                    {/* BPM */}
                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">Tempo</label>
                            <span className="text-xs font-mono text-indigo-300 font-bold">{bpm} BPM</span>
                        </div>
                        <input
                            type="range"
                            min="60"
                            max="160"
                            step="5"
                            value={bpm}
                            onChange={(e) => onChangeBpm(parseInt(e.target.value))}
                            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                    </div>

                    {/* Auto-Mutate */}
                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">Auto-Seed</label>
                            <span className="text-xs font-mono text-amber-300 font-bold">{mutationRate === 0 ? 'Off' : mutationRate}</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="10"
                            value={mutationRate}
                            onChange={(e) => onChangeMutationRate(parseInt(e.target.value))}
                            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                    </div>
                </div>

            </div>

            {/* Zone legend */}
            <div className="flex items-center justify-center gap-4 pt-3 border-t border-white/[0.04]">
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm bg-violet-500/60"></div>
                    <span className="text-[10px] text-slate-500">Melody</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm bg-cyan-500/60"></div>
                    <span className="text-[10px] text-slate-500">Harmony</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/60"></div>
                    <span className="text-[10px] text-slate-500">Bass</span>
                </div>
            </div>
        </div>
    );
};
