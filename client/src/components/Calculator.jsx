import { useState, useRef, useEffect } from 'react';
import { Calculator as CalcIcon, X } from 'lucide-react';

/*
 * A self-contained scientific calculator that floats beside the estimate/invoice
 * editor. `<CalculatorButton />` renders the "Calculator" button plus the panel
 * and manages its own open/close — drop it into any modal with no other wiring.
 *
 * The expression is evaluated with a small shunting-yard parser (no eval), so it
 * safely supports + - × ÷, powers, parentheses and the usual scientific
 * functions. Degrees/Radians toggle for trig.
 */

// ---- Safe expression evaluator (tokenize → RPN → compute) -------------------
const FUNCS = new Set(['sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', 'exp', 'abs']);
const CONSTS = { pi: Math.PI, e: Math.E };

function tokenize(src) {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi');
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let n = '';
      while (i < s.length && /[0-9.]/.test(s[i])) n += s[i++];
      tokens.push({ t: 'num', v: parseFloat(n) });
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let name = '';
      while (i < s.length && /[a-zA-Z]/.test(s[i])) name += s[i++];
      tokens.push({ t: 'name', v: name.toLowerCase() });
      continue;
    }
    if ('+-*/^'.includes(c)) { tokens.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(') { tokens.push({ t: 'lp' }); i++; continue; }
    if (c === ')') { tokens.push({ t: 'rp' }); i++; continue; }
    throw new Error('Unexpected character: ' + c);
  }
  return tokens;
}

const PREC = { 'u-': 5, '^': 4, '*': 3, '/': 3, '+': 2, '-': 2 };
const RIGHT = new Set(['^', 'u-']);

function toRPN(tokens) {
  const out = [];
  const ops = [];
  let prev = null;
  for (const tk of tokens) {
    if (tk.t === 'num') { out.push(tk); }
    else if (tk.t === 'name') {
      if (FUNCS.has(tk.v)) ops.push({ t: 'func', v: tk.v });
      else if (tk.v in CONSTS) out.push({ t: 'num', v: CONSTS[tk.v] });
      else throw new Error('Unknown name: ' + tk.v);
    } else if (tk.t === 'op') {
      let op = tk.v;
      // Unary minus: at the start, or after another operator / '('.
      if (op === '-' && (!prev || prev.t === 'op' || prev.t === 'lp')) op = 'u-';
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t === 'func') { out.push(ops.pop()); continue; }
        if (top.t === 'op' && (PREC[top.v] > PREC[op] || (PREC[top.v] === PREC[op] && !RIGHT.has(op)))) { out.push(ops.pop()); continue; }
        break;
      }
      ops.push({ t: 'op', v: op });
    } else if (tk.t === 'lp') { ops.push(tk); }
    else if (tk.t === 'rp') {
      while (ops.length && ops[ops.length - 1].t !== 'lp') out.push(ops.pop());
      if (!ops.length) throw new Error('Mismatched )');
      ops.pop();
      if (ops.length && ops[ops.length - 1].t === 'func') out.push(ops.pop());
    }
    prev = tk.t === 'op' ? { t: 'op' } : tk;
  }
  while (ops.length) {
    const top = ops.pop();
    if (top.t === 'lp') throw new Error('Mismatched (');
    out.push(top);
  }
  return out;
}

function evalRPN(rpn, deg) {
  const st = [];
  const toRad = (x) => (deg ? (x * Math.PI) / 180 : x);
  const fromRad = (x) => (deg ? (x * 180) / Math.PI : x);
  for (const tk of rpn) {
    if (tk.t === 'num') { st.push(tk.v); continue; }
    if (tk.t === 'op') {
      if (tk.v === 'u-') { st.push(-st.pop()); continue; }
      const b = st.pop(), a = st.pop();
      if (a === undefined || b === undefined) throw new Error('Incomplete expression');
      st.push(tk.v === '+' ? a + b : tk.v === '-' ? a - b : tk.v === '*' ? a * b : tk.v === '/' ? a / b : Math.pow(a, b));
      continue;
    }
    if (tk.t === 'func') {
      const x = st.pop();
      if (x === undefined) throw new Error('Incomplete expression');
      switch (tk.v) {
        case 'sqrt': st.push(Math.sqrt(x)); break;
        case 'sin': st.push(Math.sin(toRad(x))); break;
        case 'cos': st.push(Math.cos(toRad(x))); break;
        case 'tan': st.push(Math.tan(toRad(x))); break;
        case 'asin': st.push(fromRad(Math.asin(x))); break;
        case 'acos': st.push(fromRad(Math.acos(x))); break;
        case 'atan': st.push(fromRad(Math.atan(x))); break;
        case 'log': st.push(Math.log10(x)); break;
        case 'ln': st.push(Math.log(x)); break;
        case 'exp': st.push(Math.exp(x)); break;
        case 'abs': st.push(Math.abs(x)); break;
        default: throw new Error('Unknown function');
      }
      continue;
    }
  }
  if (st.length !== 1) throw new Error('Invalid expression');
  return st[0];
}

function evaluate(expr, deg) {
  const val = evalRPN(toRPN(tokenize(expr)), deg);
  if (!isFinite(val)) throw new Error('Math error');
  // Trim floating-point noise but keep precision.
  return String(Math.round((val + Number.EPSILON) * 1e10) / 1e10);
}

// ---- The floating calculator panel -----------------------------------------
function CalculatorPanel({ onClose }) {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState('');
  const [deg, setDeg] = useState(true);
  const [pos, setPos] = useState({ x: null, y: 96 }); // x null → anchored right
  const drag = useRef(null);

  useEffect(() => {
    function move(e) {
      if (!drag.current) return;
      setPos({ x: e.clientX - drag.current.dx, y: Math.max(8, e.clientY - drag.current.dy) });
    }
    function up() { drag.current = null; }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  function startDrag(e) {
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    setPos({ x: rect.left, y: rect.top });
  }

  const push = (s) => { setExpr(e => e + s); setResult(''); };
  const clearAll = () => { setExpr(''); setResult(''); };
  const back = () => setExpr(e => e.slice(0, -1));
  const equals = () => {
    if (!expr.trim()) return;
    try { setResult(evaluate(expr, deg)); }
    catch { setResult('Error'); }
  };
  const useResult = () => { if (result && result !== 'Error') { setExpr(result); setResult(''); } };
  const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); equals(); } };

  const style = pos.x == null
    ? { top: pos.y, right: 24 }
    : { top: pos.y, left: pos.x };

  const Btn = ({ label, onClick, cls = '' }) => (
    <button type="button" onClick={onClick}
      className={`h-10 rounded-lg text-sm font-semibold active:scale-95 transition ${cls || 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
      {label}
    </button>
  );

  return (
    <div style={style} className="fixed z-[10000] w-[270px] rounded-2xl bg-white border border-slate-200 shadow-2xl select-none">
      {/* Header (drag handle) */}
      <div onMouseDown={startDrag} className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 cursor-move rounded-t-2xl bg-slate-50">
        <CalcIcon size={15} className="text-slate-500" />
        <span className="text-sm font-semibold text-slate-700">Calculator</span>
        <button type="button" onClick={() => setDeg(d => !d)} title="Toggle degrees / radians"
          className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 hover:bg-slate-300">
          {deg ? 'DEG' : 'RAD'}
        </button>
        <button type="button" onClick={onClose} title="Close calculator" className="p-1 rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700">
          <X size={16} />
        </button>
      </div>

      {/* Display */}
      <div className="px-3 pt-3">
        <input value={expr} onChange={e => { setExpr(e.target.value); setResult(''); }} onKeyDown={onKey}
          placeholder="0" spellCheck={false}
          className="w-full text-right text-lg font-mono px-2 py-2 rounded-lg border border-slate-200 outline-none focus:border-blue-400" />
        <div className="text-right text-sm text-slate-500 h-5 pr-1 font-mono truncate">{result !== '' ? `= ${result}` : ''}</div>
      </div>

      {/* Scientific row */}
      <div className="grid grid-cols-4 gap-1.5 px-3 pb-1.5">
        <Btn label="sin" onClick={() => push('sin(')} cls="bg-slate-50 text-slate-600 hover:bg-slate-100 text-xs" />
        <Btn label="cos" onClick={() => push('cos(')} cls="bg-slate-50 text-slate-600 hover:bg-slate-100 text-xs" />
        <Btn label="tan" onClick={() => push('tan(')} cls="bg-slate-50 text-slate-600 hover:bg-slate-100 text-xs" />
        <Btn label="√" onClick={() => push('sqrt(')} cls="bg-slate-50 text-slate-600 hover:bg-slate-100" />
        <Btn label="ln" onClick={() => push('ln(')} cls="bg-slate-50 text-slate-600 hover:bg-slate-100 text-xs" />
        <Btn label="log" onClick={() => push('log(')} cls="bg-slate-50 text-slate-600 hover:bg-slate-100 text-xs" />
        <Btn label="xʸ" onClick={() => push('^')} cls="bg-slate-50 text-slate-600 hover:bg-slate-100" />
        <Btn label="π" onClick={() => push('pi')} cls="bg-slate-50 text-slate-600 hover:bg-slate-100" />
      </div>

      {/* Main keypad */}
      <div className="grid grid-cols-4 gap-1.5 px-3 pb-3">
        <Btn label="C" onClick={clearAll} cls="bg-red-50 text-red-600 hover:bg-red-100" />
        <Btn label="(" onClick={() => push('(')} />
        <Btn label=")" onClick={() => push(')')} />
        <Btn label="⌫" onClick={back} cls="bg-slate-100 text-slate-600 hover:bg-slate-200" />

        <Btn label="7" onClick={() => push('7')} cls="bg-white border border-slate-200 text-slate-800 hover:bg-slate-50" />
        <Btn label="8" onClick={() => push('8')} cls="bg-white border border-slate-200 text-slate-800 hover:bg-slate-50" />
        <Btn label="9" onClick={() => push('9')} cls="bg-white border border-slate-200 text-slate-800 hover:bg-slate-50" />
        <Btn label="÷" onClick={() => push('÷')} cls="bg-blue-50 text-blue-700 hover:bg-blue-100" />

        <Btn label="4" onClick={() => push('4')} cls="bg-white border border-slate-200 text-slate-800 hover:bg-slate-50" />
        <Btn label="5" onClick={() => push('5')} cls="bg-white border border-slate-200 text-slate-800 hover:bg-slate-50" />
        <Btn label="6" onClick={() => push('6')} cls="bg-white border border-slate-200 text-slate-800 hover:bg-slate-50" />
        <Btn label="×" onClick={() => push('×')} cls="bg-blue-50 text-blue-700 hover:bg-blue-100" />

        <Btn label="1" onClick={() => push('1')} cls="bg-white border border-slate-200 text-slate-800 hover:bg-slate-50" />
        <Btn label="2" onClick={() => push('2')} cls="bg-white border border-slate-200 text-slate-800 hover:bg-slate-50" />
        <Btn label="3" onClick={() => push('3')} cls="bg-white border border-slate-200 text-slate-800 hover:bg-slate-50" />
        <Btn label="−" onClick={() => push('-')} cls="bg-blue-50 text-blue-700 hover:bg-blue-100" />

        <Btn label="0" onClick={() => push('0')} cls="bg-white border border-slate-200 text-slate-800 hover:bg-slate-50" />
        <Btn label="." onClick={() => push('.')} cls="bg-white border border-slate-200 text-slate-800 hover:bg-slate-50" />
        <Btn label="=" onClick={equals} cls="bg-blue-600 text-white hover:bg-blue-700" />
        <Btn label="+" onClick={() => push('+')} cls="bg-blue-50 text-blue-700 hover:bg-blue-100" />
      </div>

      {result !== '' && result !== 'Error' && (
        <div className="px-3 pb-3 -mt-1">
          <button type="button" onClick={useResult} className="w-full text-xs font-semibold text-blue-600 hover:text-blue-700">Use answer</button>
        </div>
      )}
    </div>
  );
}

// The button that toggles the calculator. Drop this anywhere in an editor.
export function CalculatorButton({ className = '' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors ${className}`}>
        <CalcIcon size={15} /> Calculator
      </button>
      {open && <CalculatorPanel onClose={() => setOpen(false)} />}
    </>
  );
}

export default CalculatorButton;
