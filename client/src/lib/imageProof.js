// Turn a picked File into a proof payload small enough for Firestore.
// Images are resized + JPEG-compressed; PDFs are accepted under a size cap.
const MAX_CHARS = 900_000; // ~ base64 length ceiling (well under Firestore's 1MB doc limit)

export function fileToProof(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected'));

    if (file.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onload = () => {
        if (String(reader.result).length > MAX_CHARS) {
          reject(new Error('That PDF is too large (max ~600KB). Please upload a photo, or a smaller/single-page PDF.'));
        } else {
          resolve({ proof: reader.result, proof_type: 'pdf' });
        }
      };
      reader.onerror = () => reject(new Error('Could not read the PDF'));
      reader.readAsDataURL(file);
      return;
    }

    if (!file.type.startsWith('image/')) return reject(new Error('Please upload a photo or PDF'));

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const max = 1280;
      if (width > max || height > max) {
        const s = max / Math.max(width, height);
        width = Math.round(width * s);
        height = Math.round(height * s);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      let q = 0.72;
      let data = canvas.toDataURL('image/jpeg', q);
      while (data.length > MAX_CHARS && q > 0.3) {
        q -= 0.12;
        data = canvas.toDataURL('image/jpeg', q);
      }
      resolve({ proof: data, proof_type: 'image' });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}
