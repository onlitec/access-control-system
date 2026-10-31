const $ = (id) => document.getElementById(id);
const token = location.pathname.split('/')[2] || '';
const API = '/api/public/invite/' + encodeURIComponent(token);
const FACE_MAX = 95 * 1024;   // o HikCentral aceita JPG de 10 a 100 KB para o rosto
const DOC_MAX = 900 * 1024;

function msg(text, error) { $('msg').textContent = text || ''; $('msg').className = error ? 'err' : ''; }
const fmtDay = (d) => d.split('-').reverse().join('/');

function showStatus(title, text) {
  $('form').hidden = true; $('status').hidden = false;
  $('status-title').textContent = title; $('status-text').textContent = text;
}

function showVisit(visit) {
  if (visit.status === 'APPROVED') showStatus('Acesso liberado', `Sua visita de ${fmtDay(visit.visitDate)} foi aprovada. Apresente-se à portaria; seu rosto será reconhecido.`);
  else if (visit.status === 'REJECTED') showStatus('Cadastro recusado', visit.rejectReason ? 'Motivo: ' + visit.rejectReason : 'O morador não aprovou este cadastro.');
  else if (visit.status === 'CANCELLED') showStatus('Visita cancelada', 'O morador cancelou esta visita.');
  else showStatus('Aguardando aprovação', `Recebemos seu cadastro, ${visit.name}. Assim que o morador aprovar, esta página mostra o acesso liberado.`);
}

async function load() {
  const res = await fetch(API, { cache: 'no-store' });
  if (res.status === 404) { showStatus('Convite não encontrado', 'Confira o link recebido.'); return null; }
  return res.json();
}

function setup(inv) {
  $('intro').textContent = `${inv.residentName} convidou você. Preencha o cadastro para liberar a entrada.`;
  if (inv.type === 'PROVIDER') $('company-box').hidden = false;
  if (inv.allowVehicle) $('plate-box').hidden = false;
  const today = new Date(); const t = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  $('date').min = t > inv.validFrom ? t : inv.validFrom; $('date').max = inv.validUntil;
  $('date').value = $('date').min;
  $('form').hidden = false;
}

// Reduz a foto no navegador até caber no limite (JPEG).
async function toJpeg(file, maxBytes, maxSide) {
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    for (const q of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]) {
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
      if (blob && blob.size <= maxBytes) return blob;
    }
    scale *= 0.8;
  }
  throw new Error('Não foi possível reduzir a foto. Tente outra.');
}

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = reject; r.readAsDataURL(blob);
});

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('send'); btn.disabled = true; msg('Enviando…');
  try {
    const face = await toJpeg($('face').files[0], FACE_MAX, 720);
    const doc = await toJpeg($('doc').files[0], DOC_MAX, 1600);
    const res = await fetch(API + '/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: $('name').value, surname: $('surname').value, phone: $('phone').value, email: $('email').value,
        document: $('document').value, company: $('company').value, plate: $('plate').value, visitDate: $('date').value,
        faceBase64: await toBase64(face), documentBase64: await toBase64(doc), lgpdConsent: $('lgpd').checked, saveConsent: $('save').checked,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não foi possível enviar.');
    msg('');
    const inv = await load(); if (inv && inv.visit) showVisit(inv.visit);
  } catch (err) { msg(err.message, true); btn.disabled = false; }
});

(async () => {
  try {
    const inv = await load(); if (!inv) return;
    if (inv.visit) {
      showVisit(inv.visit);
      if (inv.visit.status === 'PENDING_APPROVAL') {
        const timer = setInterval(async () => { const i = await load().catch(() => null); if (i && i.visit && i.visit.status !== 'PENDING_APPROVAL') { clearInterval(timer); showVisit(i.visit); } }, 20000);
      }
      return;
    }
    if (inv.state === 'EXPIRED') return showStatus('Convite vencido', 'Peça um novo convite ao morador.');
    if (inv.state === 'CANCELLED') return showStatus('Convite cancelado', 'O morador cancelou este convite.');
    setup(inv);
  } catch { msg('Não foi possível carregar o convite. Tente novamente.', true); }
})();
