import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Eraser } from 'lucide-react';

// Canvas signature pad. Exposes { isEmpty(), clear(), toDataURL() } via ref.
const SignaturePad = forwardRef(function SignaturePad({ height = 190 }, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  function point(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }
  function start(e) {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInk.current = true;
  }
  function end() { drawing.current = false; }

  function clear() {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    hasInk.current = false;
  }

  useImperativeHandle(ref, () => ({
    isEmpty: () => !hasInk.current,
    clear,
    toDataURL: () => canvasRef.current.toDataURL('image/png'),
  }));

  return (
    <div>
      <div className="relative rounded-xl border-2 border-dashed border-slate-300 overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          style={{ height, width: '100%', touchAction: 'none', display: 'block', cursor: 'crosshair' }}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
        <span className="absolute bottom-2 left-0 right-0 text-center text-[11px] text-slate-300 pointer-events-none">Sign above</span>
      </div>
      <button type="button" onClick={clear} className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700">
        <Eraser size={13} /> Clear
      </button>
    </div>
  );
});

export default SignaturePad;
