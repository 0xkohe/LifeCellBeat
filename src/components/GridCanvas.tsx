import React, { useRef, useEffect } from 'react';
import { NCAEngine } from '../engine/NCAEngine';

interface GridCanvasProps {
    engine: NCAEngine;
    width: number;
    height: number;
    gridSize: number;
    onInteract: (x: number, y: number) => void;
}

// Zone boundaries matching AudioEngine zones
const MELODY_ZONE = 0.4;  // top 40%
const BASS_ZONE = 0.7;    // bottom 30%

export const GridCanvas: React.FC<GridCanvasProps> = ({ engine, width, height, gridSize, onInteract }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;

        const render = () => {
            const grid = engine.getCurrentGrid();
            const channels = 2;
            const cw = canvas.width;
            const ch = canvas.height;

            // Trail effect: fade previous frame
            ctx.fillStyle = 'rgba(5, 5, 15, 0.18)';
            ctx.fillRect(0, 0, cw, ch);

            const cellW = cw / gridSize;
            const cellH = ch / gridSize;

            // Draw cells
            for (let y = 0; y < gridSize; y++) {
                for (let x = 0; x < gridSize; x++) {
                    const idx = (y * gridSize + x) * channels;
                    const active = grid[idx];
                    const colorWeight = grid[idx + 1];

                    if (active > 0.05) {
                        // Zone-aware coloring
                        const relY = y / gridSize;
                        let hue: number;
                        if (relY < MELODY_ZONE) {
                            // Melody zone: violet to fuchsia (280–320)
                            hue = 280 + colorWeight * 40;
                        } else if (relY < BASS_ZONE) {
                            // Harmony zone: cyan to blue (180–240)
                            hue = 180 + colorWeight * 60;
                        } else {
                            // Bass zone: green to teal (140–180)
                            hue = 140 + colorWeight * 40;
                        }

                        const lightness = Math.floor(active * 65) + 15;
                        const saturation = 75 + active * 15;
                        const alpha = Math.min(1.0, active * 1.4);

                        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
                        ctx.fillRect(
                            Math.floor(x * cellW),
                            Math.floor(y * cellH),
                            Math.ceil(cellW) + 1,
                            Math.ceil(cellH) + 1
                        );
                    }
                }
            }

            // Draw subtle zone dividers
            ctx.save();
            ctx.globalAlpha = 0.12;

            // Melody/Harmony boundary
            const melodyLineY = Math.floor(ch * MELODY_ZONE);
            ctx.strokeStyle = '#a78bfa'; // violet
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 8]);
            ctx.beginPath();
            ctx.moveTo(0, melodyLineY);
            ctx.lineTo(cw, melodyLineY);
            ctx.stroke();

            // Harmony/Bass boundary
            const bassLineY = Math.floor(ch * BASS_ZONE);
            ctx.strokeStyle = '#34d399'; // emerald
            ctx.beginPath();
            ctx.moveTo(0, bassLineY);
            ctx.lineTo(cw, bassLineY);
            ctx.stroke();

            ctx.restore();

            animationFrameId = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(animationFrameId);
    }, [engine, width, height, gridSize]);

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const getGridCoords = (clientX: number, clientY: number) => ({
            x: Math.floor(((clientX - rect.left) * scaleX / canvas.width) * gridSize),
            y: Math.floor(((clientY - rect.top) * scaleY / canvas.height) * gridSize),
        });

        const { x, y } = getGridCoords(e.clientX, e.clientY);
        onInteract(x, y);

        const onMove = (moveEvent: PointerEvent) => {
            const { x: mx, y: my } = getGridCoords(moveEvent.clientX, moveEvent.clientY);
            onInteract(mx, my);
        };

        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            onPointerDown={handlePointerDown}
            className="cursor-crosshair bg-[#05050f] block"
            style={{
                touchAction: 'none',
                maxHeight: 'min(72vh, 72vw)',
                maxWidth: 'min(72vh, 72vw)',
                width: '100%',
                aspectRatio: '1 / 1',
            }}
        />
    );
};
