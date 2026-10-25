import { clamp } from './dom.js';

const freePct = c => c.open ? 100 - c.occ : null;
const crowdCat = o => o < 20 ? ['Маш сул', 1] : o < 40 ? ['Сул', 2] : o < 60 ? ['Дунд зэрэг', 3] : o < 80 ? ['Завгүй', 4] : ['Маш их хүнтэй', 5];
const tone = c => !c.open ? '' : c.occ >= 75 || c.sound >= 4 ? 'y' : c.occ >= 50 || c.sound === 3 ? 'b' : 'q';
const toneVar = t => ({ q: 'var(--sage)', b: 'var(--amb)', y: 'var(--terra)' }[t] || 'var(--closed)');
function mood(c) {
  if (!c.open) return 'Одоо хаалттай байна.';
  if (c.sound <= 2 && c.occ < 50) return c.wifi >= 3 ? 'Яг одоо тайван — ажиллахад тохиромжтой цаг.' : 'Яг одоо тайван — ном уншиж, амрахад сайхан.';
  if (c.sound >= 4 || c.occ >= 80) return 'Яг одоо хөл хөдөлгөөнтэй — найзуудтайгаа уулзахад тохирно.';
  return 'Дунд зэрэг ачаалалтай — богино ажил, уулзалтад болно.'
}
const nowHour = () => clamp(new Date().getHours(), 8, 22);
const SHAPE = [.35, .5, .6, .7, .85, .95, .8, .65, .7, .85, 1, .95, .75, .55, .4];
function profile(c) { const f = c.occ / SHAPE[nowHour() - 8]; return SHAPE.map(s => clamp(Math.round(s * f), 3, 98)) }

export { freePct, crowdCat, tone, toneVar, mood, nowHour, profile };
