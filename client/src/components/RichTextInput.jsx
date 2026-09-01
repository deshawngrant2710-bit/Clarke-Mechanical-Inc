import { useRef, useEffect } from 'react';
import { Bold, Underline, Italic } from 'lucide-react';
import { sanitizeRich } from '../lib/richText';

export default function RichTextInput({ value, onChange, placeholder = '', className = '' }) {
  const ref = useRef(null);

  // Set the initial HTML once (don't fight the cursor on every keystroke).
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || '')) ref.current.innerHTML = value || '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => onChange(sanitizeRich(ref.current?.innerHTML || ''));
  const exec = (cmd) => { document.execCommand(cmd, false, null); ref.current?.focus(); emit(); };
  const btn = 'w-7 h-7 flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 border border-slate-200';

  return (
    <div className={className}>
      <div className="flex items-center gap-1 mb-1">
        <button type="button" title="Bold" onMouseDown={e => e.preventDefault()} onClick={() => exec('bold')} className={btn}><Bold size={13} /></button>
        <button type="button" title="Underline" onMouseDown={e => e.preventDefault()} onClick={() => exec('underline')} className={btn}><Underline size={13} /></button>
        <button type="button" title="Italic" onMouseDown={e => e.preventDefault()} onClick={() => exec('italic')} className={btn}><Italic size={13} /></button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        data-placeholder={placeholder}
        className="rich-input min-h-[38px] w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-400"
      />
    </div>
  );
}
