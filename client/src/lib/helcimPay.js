// Loads HelcimPay.js once; resolves when appendHelcimPayIframe is available.
const HELCIM_JS = 'https://secure.helcim.app/helcim-pay/services/start.js';

export function loadHelcimPayJs() {
  return new Promise((resolve, reject) => {
    if (window.appendHelcimPayIframe) return resolve();
    const done = () => (window.appendHelcimPayIframe ? resolve() : reject(new Error('Could not load the payment form.')));
    const existing = document.querySelector(`script[src="${HELCIM_JS}"]`);
    if (existing) {
      existing.addEventListener('load', done);
      existing.addEventListener('error', () => reject(new Error('Could not load the payment form.')));
      return;
    }
    const s = document.createElement('script');
    s.src = HELCIM_JS; s.async = true;
    s.onload = done;
    s.onerror = () => reject(new Error('Could not load the payment form.'));
    document.head.appendChild(s);
  });
}
