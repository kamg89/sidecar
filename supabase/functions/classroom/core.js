export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function text(value, max = 6000) {
  if (typeof value !== 'string' || value.length > max) throw new HttpError(400, `Text must be at most ${max} characters.`);
  return value;
}
export function uuid(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new HttpError(400, 'Invalid identifier.');
  return value;
}
export function integer(value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new HttpError(400, 'Number outside the allowed range.');
  return value;
}
export async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function token() { return [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join(''); }
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export function style(input = {}) {
  const result = {};
  if ('bold' in input) result.bold = Boolean(input.bold);
  if ('italic' in input) result.italic = Boolean(input.italic);
  if ('align' in input) { if (!['left', 'center', 'right'].includes(input.align)) throw new HttpError(400, 'Invalid alignment.'); result.align = input.align; }
  if ('size' in input) result.size = integer(input.size, 16, 44);
  if ('color' in input) { if (!/^#[a-f0-9]{6}$/i.test(input.color)) throw new HttpError(400, 'Invalid color.'); result.color = input.color; }
  return result;
}
export function publicSession(s) {
  return {id:s.id,work_mode:s.work_mode,title:s.title,instructions:s.instructions,status:s.status,ends_at:s.ends_at,created_at:s.created_at};
}
export function validateDebrief(data, validSlides) {
  if (!data || !Array.isArray(data.slides) || !data.slides.length || data.slides.length > 6) throw new HttpError(502, 'The AI returned an invalid debrief. Try again.');
  data.slides.forEach(s => {
    text(s.title, 180); text(s.takeaway, 800); text(s.question, 700); text(s.notes, 1800);
    if (!Array.isArray(s.bullets) || s.bullets.length > 5) throw new HttpError(502, 'Invalid debrief bullets.');
    s.bullets.forEach(b => text(b, 700));
    if (!Array.isArray(s.sources)) throw new HttpError(502, 'Missing evidence links.');
    s.sources = s.sources.filter(id => validSlides.has(id));
  });
  return data;
}
