import { Play, Pause, RefreshCw, Sparkles, SlidersHorizontal, Music, Pencil, Zap, AlignJustify, Atom, Waves } from 'lucide-react';
import type { SynthPresetName, ScaleName, BassPresetName } from '../engine/AudioEngine';
import type { StampType } from '../App';

interface ControlsProps {
    isPlaying: boolean;
    currentPreset: SynthPresetName;
    currentScale: ScaleName;
    bassPreset: BassPresetName;
    mutationRate: number;
    bpm: number;
    currentChordName: string;
    stampType: StampType;
    onTogglePlay: () => void;
    onReset: () => void;
    onGenerate: () => void;
    onChangePreset: (preset: SynthPresetName) => void;
    onChangeScale: (scale: ScaleName) => void;
    onChangeBassPreset: (preset: BassPresetName) => void;
    onChangeMutationRate: (rate: number) => void;
    onChangeBpm: (bpm: number) => void;
    onChangeStamp: (stamp: StampType) => void;
}

const STAMPS: { id: StampType; label: string; icon: React.ReactNode; desc: string }[] = [
    { id: 'draw', label: 'Draw', icon: <Pencil size={13} />, desc: 'Free draw cells' },
    { id: 'glider', label: 'Glider', icon: <Zap size={13} />, desc: 'Travels diagonally' },
    { id: 'blinker', label: 'Blinker', icon: <AlignJustify size={13} />, desc: '2-period oscillator' },
    { id: 'rpento', label: 'R-Pento', icon: <Atom size={13} />, desc: 'Long-lived chaos' },
    { id: 'lwss', label: 'Ship', icon: <Waves size={13} />, desc: 'Horizontal mover' },
];

export const Controls = ({
    isPlaying, currentPreset, currentScale, bassPreset, mutationRate, bpm,
    currentChordName, stampType,
    onTogglePlay, onReset, onGenerate,
    onChangePreset, onChangeScale, onChangeBassPreset,
    onChangeMutationRate, onChangeBpm, onChangeStamp,
}: ControlsProps) => {
    return (
        <div className="flex flex-col gap-4 bg-white/[0.03] p-5 rounded-2xl border border-white/[0.08] backdrop-blur-xl w-full max-w-[800px] shadow-2xl relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

            {/* ── Row 1: Play controls + chord display ─────────────────────── */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={onTogglePlay}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all duration-300 text-sm shrink-0 ${isPlaying
                            ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 shadow-lg shadow-indigo-500/20'
                            }`}
                    >
                        {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
                        <span className="font-heading tracking-wide">{isPlaying ? 'Pause' : 'Play'}</span>
                    </button>

                    <button
                        onClick={onGenerate}
                        className="flex items-center gap-2 px-4 py-2.5 bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 rounded-xl font-medium transition-all border border-violet-500/20 text-sm shrink-0"
                        title="Generate a diverse pattern automatically"
                    >
                        <Sparkles size={14} className="text-amber-300" />
                        <span>Generate</span>
                    </button>

                    <button
                        onClick={onReset}
                        className="flex items-center justify-center w-10 h-10 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl transition-all border border-white/5 group shrink-0"
                        title="Clear grid"
                    >
                        <RefreshCw size={15} className="group-hover:rotate-180 transition-transform duration-500 text-rose-300" />
                    </button>
                </div>

                {currentChordName && (
                    <div className="px-3 py-2 bg-indigo-500/10 border border-indigo-500/25 rounded-xl text-indigo-300 font-mono text-[11px] flex items-center gap-2 shrink-0 max-w-full truncate">
                        <span className="relative flex h-2 w-2 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                        </span>
                        <span className="font-heading tracking-wider truncate">{currentChordName}</span>
                    </div>
                )}
            </div>

            {/* ── Row 2: Stamp palette ──────────────────────────────────────── */}
            <div className="flex flex-col gap-2 pt-3 border-t border-white/[0.06]">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">Stamp Tool</label>
                <div className="flex gap-1.5 flex-wrap">
                    {STAMPS.map(s => (
                        <button
                            key={s.id}
                            onClick={() => onChangeStamp(s.id)}
                            title={s.desc}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${stampType === s.id
                                ? 'bg-violet-500/30 border-violet-400/50 text-violet-200 shadow-sm shadow-violet-500/20'
                                : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                                }`}
                        >
                            {s.icon}
                            <span>{s.label}</span>
                        </button>
                    ))}
                </div>
                <p className="text-[10px] text-slate-600">
                    {STAMPS.find(s => s.id === stampType)?.desc}
                </p>
            </div>

            {/* ── Row 3: Synth controls ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-white/[0.06]">

                <div className="flex flex-col gap-3">
                    {/* Timbre */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0">
                            <SlidersHorizontal size={14} className="text-violet-400" />
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                            <label className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mb-1">Timbre</label>
                            <select
                                value={currentPreset}
                                onChange={(e) => onChangePreset(e.target.value as SynthPresetName)}
                                className="bg-black/30 text-slate-200 text-xs rounded-lg px-2 py-1.5 border border-white/10 focus:outline-none cursor-pointer w-full"
                            >
                                <option value="pluck" className="bg-slate-900">Pluck / Marimba</option>
                                <option value="crystal" className="bg-slate-900">Crystal / Bells</option>
                                <option value="pad" className="bg-slate-900">Soft Pad</option>
                            </select>
                        </div>
                    </div>

                    {/* Bass Type */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                            <Waves size={14} className="text-emerald-400" />
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                            <label className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mb-1">Bass Type</label>
                            <select
                                value={bassPreset}
                                onChange={(e) => onChangeBassPreset(e.target.value as BassPresetName)}
                                className="bg-black/30 text-slate-200 text-xs rounded-lg px-2 py-1.5 border border-white/10 focus:outline-none cursor-pointer w-full"
                            >
                                <option value="sawtooth" className="bg-slate-900">Sawtooth (Warm)</option>
                                <option value="sub" className="bg-slate-900">Sub Bass (Deep)</option>
                                <option value="pluck" className="bg-slate-900">Pluck (Punchy)</option>
                                <option value="upright" className="bg-slate-900">Upright (Smooth)</option>
                            </select>
                        </div>
                    </div>

                    {/* Scale */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-fuchsia-500/20 flex items-center justify-center shrink-0">
                            <Music size={14} className="text-fuchsia-400" />
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                            <label className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mb-1">Scale</label>
                            <select
                                value={currentScale}
                                onChange={(e) => onChangeScale(e.target.value as ScaleName)}
                                className="bg-black/30 text-slate-200 text-xs rounded-lg px-2 py-1.5 border border-white/10 focus:outline-none cursor-pointer w-full"
                            >
                                <option value="pentatonic" className="bg-slate-900">Pentatonic Minor</option>
                                <option value="minor" className="bg-slate-900">Natural Minor</option>
                                <option value="major" className="bg-slate-900">Major</option>
                                <option value="dorian" className="bg-slate-900">Dorian</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-3 justify-center">
                    {/* BPM */}
                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">Tempo</label>
                            <span className="text-xs font-mono text-indigo-300 font-bold">{bpm} BPM</span>
                        </div>
                        <input type="range" min="60" max="160" step="5" value={bpm}
                            onChange={(e) => onChangeBpm(parseInt(e.target.value))}
                            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                    </div>

                    {/* Auto-Seed */}
                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">Auto-Seed</label>
                            <span className="text-xs font-mono text-amber-300 font-bold">{mutationRate === 0 ? 'Off' : mutationRate}</span>
                        </div>
                        <input type="range" min="0" max="10" value={mutationRate}
                            onChange={(e) => onChangeMutationRate(parseInt(e.target.value))}
                            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                    </div>
                </div>
            </div>

            {/* ── Footer: Zone legend ───────────────────────────────────────── */}
            <div className="flex items-center justify-center gap-4 pt-3 border-t border-white/[0.04]">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-violet-500/60" /><span className="text-[10px] text-slate-500">Melody</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-cyan-500/60" /><span className="text-[10px] text-slate-500">Harmony</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/60" /><span className="text-[10px] text-slate-500">Bass</span></div>
            </div>
        </div>
    );
};
