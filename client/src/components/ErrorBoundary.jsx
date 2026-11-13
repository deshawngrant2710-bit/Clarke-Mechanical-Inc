import { Component } from 'react';

// Catches any render crash in the page area so a single broken screen shows a
// friendly, recoverable message instead of white-screening the whole app.
// It's keyed on the route (see where it's used), so navigating to another page
// clears the error automatically.
export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null, info: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('[app] page crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const msg = this.state.error?.message || String(this.state.error);
    // First app-code frame from the component stack, to point at the culprit.
    const where = (this.state.info?.componentStack || '')
      .split('\n').map(s => s.trim()).filter(Boolean).slice(0, 4).join('  ›  ');
    return (
      <div className="flex items-center justify-center py-16 px-4">
        <div className="max-w-lg w-full text-center bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <div className="text-4xl mb-2">⚠️</div>
          <h1 className="text-lg font-bold text-slate-900 mb-1">This screen hit a snag</h1>
          <p className="text-sm text-slate-500 mb-5">The rest of the app is fine and your data is safe. Reload this screen, or head back to the home screen.</p>
          <div className="flex gap-2 justify-center mb-5">
            <button onClick={() => window.location.reload()}
              className="bg-blue-600 text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-700">Reload</button>
            <button onClick={() => { window.location.href = '/field'; }}
              className="border border-slate-300 text-slate-700 rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-slate-50">Home</button>
          </div>
          <details className="text-left">
            <summary className="text-xs text-slate-400 cursor-pointer select-none">Technical details</summary>
            <div className="mt-2 p-3 rounded-lg bg-slate-50 border border-slate-100 text-[11px] text-slate-600 break-words font-mono">
              <p className="text-red-600">{msg}</p>
              {where && <p className="mt-1 text-slate-500">{where}</p>}
            </div>
          </details>
        </div>
      </div>
    );
  }
}
