// «Тайлан»: цаг бүрээр хэдэн хүн байсныг энгийн баганан графикаар (SVG, сангүй).
// Одоо байгаа түүхийн API-г ашиглана: /owner/cafes/:id/sensor-history?interval=60&since&until.
// Хэмжилтгүй цагт багана зурахгүй; туршилтын өгөгдөл бол үүнийгээ шууд хэлнэ.
import { Component, html, raw } from '../../../framework/index.js';
import { platform } from '../../services/platform.js';
import { sourceWord, reportRange, hourlyPeople, busiestText } from './owner-words.js';

const RANGES = [['today', 'Өнөөдөр'], ['yesterday', 'Өчигдөр'], ['week', '7 хоног']];
const TITLE = { today: 'Өнөөдөр цаг бүрээр хэдэн хүн байсан', yesterday: 'Өчигдөр цаг бүрээр хэдэн хүн байсан', week: 'Сүүлийн 7 хоногт цаг бүрийн дундаж' };

export class OwnerReport extends Component {
  initialState() { return { range: 'today', data: null, error: null }; }
  events() { return { 'click [data-report-range]': (e, b) => { this.setState({ range: b.dataset.reportRange, data: null }); this.load(); } }; }
  onMount() { this.load(); this.interval(() => { if (!document.hidden) this.load(); }, 300000); }
  onUpdate() { if (this.loadedSource && this.loadedSource !== this.props.source) this.load(); }
  async load() {
    this.loadedSource = this.props.source;
    const request = this.request = (this.request || 0) + 1, { since, until } = reportRange(this.state.range);
    try {
      const data = await platform.api.get(`/owner/cafes/${encodeURIComponent(this.props.cafeId)}/sensor-history?source=${this.props.source}&interval=60&limit=1&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`);
      if (this.mounted && request === this.request) this.setState({ data, error: null });
    } catch (error) { if (this.mounted && request === this.request) this.setState({ error: error.message || 'Ачаалж чадсангүй' }); }
  }
  chart(bars) {
    const max = Math.max(1, ...bars.map(b => b.value ?? 0)), W = 24 * 22, H = 150, top = 14;
    const best = bars.filter(b => b.value != null).sort((a, b) => b.value - a.value)[0]?.hour;
    return html`<svg class="rep-chart" viewBox="0 0 ${W} ${H + 22}" role="img" aria-label="Цаг бүрийн дундаж хүний тоо">
      ${bars.map(b => b.value == null ? '' : html`<g><title>${b.hour}:00 · ${b.value} хүн</title><rect class="${b.hour === best ? 'best' : ''}" x="${b.hour * 22 + 3}" y="${top + (H - top) * (1 - b.value / max)}" width="16" height="${Math.max(2, (H - top) * b.value / max)}" rx="3"/></g>`)}
      <line x1="0" x2="${W}" y1="${H}" y2="${H}"/>
      ${[0, 3, 6, 9, 12, 15, 18, 21].map(h => html`<text x="${h * 22 + 11}" y="${H + 16}">${h}</text>`)}
    </svg>`;
  }
  render() {
    const { range, data, error } = this.state, source = this.props.source;
    const bars = data ? hourlyPeople(data.aggregates) : [], has = bars.some(b => b.value != null), busiest = busiestText(bars);
    return html`<div class="rep">
      <div class="card-h"><h2>${TITLE[range]}</h2><span class="badge ${source === 'simulated' ? 'b-typ' : 'b-live'}">${sourceWord(source)}</span></div>
      <div class="seg rep-range" role="group" aria-label="Хугацаа">${RANGES.map(([k, l]) => html`<button type="button" data-report-range="${k}" aria-pressed="${k === range}">${l}</button>`)}</div>
      ${error ? html`<p class="muted" role="alert">${error}</p>` : !data ? html`<div class="skel" style="height:170px"></div>`
        : has ? html`${this.chart(bars)}<p class="rep-best">${busiest || 'Энэ хугацаанд зочин ажиглагдаагүй.'}</p>
            <p class="muted rep-note">Камерын ажигласан хүний дундаж тоо (цагаар). Хүний тоо нь сул суудлын тоо биш.${source === 'simulated' ? ' Туршилтын өгөгдөл — бодит зочид биш.' : ''}</p>`
        : html`<p class="rep-empty">Одоогоор хэмжилт алга.</p>`}
    </div>`;
  }
}
