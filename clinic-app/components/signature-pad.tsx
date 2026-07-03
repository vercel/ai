'use client';

import { useRef, useState } from 'react';

export function SignaturePad({
  onSign,
  signerLabel,
}: {
  onSign: (dataUrl: string, signerName: string) => void;
  signerLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signerName, setSignerName] = useState('');

  function getPos(event: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in event) {
      const touch = event.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.MouseEvent | React.TouchEvent) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = getPos(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(event: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = getPos(event);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    setHasDrawn(true);
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  function confirm() {
    if (!hasDrawn || !signerName.trim()) return;
    const dataUrl = canvasRef.current!.toDataURL('image/png');
    onSign(dataUrl, signerName.trim());
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-gray-600">
        Nome de quem está assinando ({signerLabel})
        <input
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </label>
      <canvas
        ref={canvasRef}
        width={400}
        height={150}
        className="touch-none rounded border border-gray-300 bg-white"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={clear}
          className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          Limpar
        </button>
        <button
          type="button"
          disabled={!hasDrawn || !signerName.trim()}
          onClick={confirm}
          className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-40"
        >
          Confirmar assinatura
        </button>
      </div>
    </div>
  );
}
