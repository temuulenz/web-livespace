import { Component, html, raw } from '../../../framework/index.js';
import { platform } from '../../services/platform.js';
import { sensorTime, sensorSourceLabel, noiseText } from '../../live/sensor-ui.js';

function occupancyChart(aggregates, source) {
  const buckets = aggregates.filter(row => Number.isFinite(row.averageObservedPeople)).slice(-24);
  if (!buckets.length) return '';
  const max = Math.max(1, ...buckets.map(row => row.averageObservedPeople));
  return html`<figure class="cd-history-chart" aria-hidden="true">
    <figcaption>Ажиглагдсан хүний тоо · ${sensorSourceLabel(source)}</figcaption>
    <div class="cd-history-bars">${buckets.map(row => html`<span style="--level:${100 * row.averageObservedPeople / max}%" title="${sensorTime(row.timestamp)} · ${row.averageObservedPeople.toFixed(1)} хүн"></span>`)}</div>
    <div class="cd-history-range"><span>${sensorTime(buckets[0].timestamp)}</span><span>${sensorTime(buckets.at(-1).timestamp)}</span></div>
  </figure>`;
}

export class SensorHistory extends Component {
  initialState(props) { return { source: props.source || 'real', interval: 5, data: null, error: null }; }
  events() {
    return {
      'change [data-history-source]': (event, input) => { this.userSource = true; this.setState({ source: input.value, data: null }); this.load(); },
      'change [data-history-interval]': (event, input) => { this.setState({ interval: Number(input.value) }); this.load(); },
      'click [data-history-refresh]': () => this.load()
    };
  }
  onMount() {
    this.onCleanup(platform.bus.on('sensor:updated', id => {
      if (id !== this.props.cafeId || this.refreshPending || document.hidden || Date.now()-(this.lastLoad || 0)<600000) return;
      this.refreshPending = true;
      this.timeout(() => { this.refreshPending = false; this.load(); }, 300);
    }));
    this.interval(() => { if (!document.hidden) this.load(); }, 600000);
    this.load();
  }
  onUpdate() {
    if (!this.userSource && this.props.source && this.state.source !== this.props.source) { this.setState({ source: this.props.source, data: null }); this.load(); }
  }
  async load() {
    if(Date.now()<(this.retryAfter || 0))return;
    if(this.loading){this.reloadPending=true;return;}
    this.loading=true;this.lastLoad=Date.now();
    const request = this.request = (this.request || 0) + 1;
    const { source, interval } = this.state;
    const prefix = this.props.role === 'admin' ? '/admin' : this.props.role === 'owner' ? '/owner' : '';
    try {
      const data = await platform.api.get(`${prefix}/cafes/${encodeURIComponent(this.props.cafeId)}/sensor-history?source=${source}&interval=${interval}&limit=50`);
      if (this.mounted && this.request === request) this.setState({ data, error: null });
    } catch (error) { if(error.status===503)this.retryAfter=Date.now()+900000; if (this.mounted && this.request === request) this.setState({ error: error.message }); } finally {this.loading=false;if(this.reloadPending){this.reloadPending=false;if(this.mounted)this.load();}}
  }
  render() {
    const { source, interval, data, error } = this.state;
    const number = value => value == null ? '—' : Number(value).toFixed(1);
    return html`<div class="sensor-history" data-sensor-history>
      <h3>Мэдрэгчийн түүх / History</h3><div class="adm-filters">
        <label>Эх үүсвэр <select data-history-source>${['real', 'simulated'].map(value => html`<option value="${value}" ${raw(value === source ? 'selected' : '')}>${sensorSourceLabel(value)}</option>`)}</select></label>
        <label>Интервал <select data-history-interval>${[5, 15, 60].map(value => html`<option value="${value}" ${raw(value === interval ? 'selected' : '')}>${value} минут</option>`)}</select></label>
        <button class="btn btn-g" data-history-refresh>Шинэчлэх</button></div>
      <p class="muted">${sensorSourceLabel(source)} · Asia/Ulaanbaatar (UTC+8) · сүүлийн 24 цаг. Нэг төхөөрөмжийн цуваа; камерын тоонуудыг нэмэхгүй.${data?.deviceId ? ` Төхөөрөмж: ${data.deviceId}.` : ''}</p>
      ${error ? html`<p role="alert">${error}</p>` : !data ? html`<p>Ачаалж байна…</p>` : html`
        ${this.props.chart ? occupancyChart(data.aggregates, source) : ''}
        <div class="adm-scroll"><table class="adm-t"><thead><tr><th>Интервал эхлэх</th><th>Хүн дундаж / min / max</th><th>Сорьц</th><th>Хамрах хүрээ</th><th>Калибровктой SPL дундаж</th></tr></thead><tbody>
          ${data.aggregates.length ? data.aggregates.slice(-24).reverse().map(row => html`<tr data-history-bucket><td>${sensorTime(row.timestamp)}</td><td>${number(row.averageObservedPeople)} / ${row.minimumObservedPeople ?? '—'} / ${row.maximumObservedPeople ?? '—'}</td><td>${row.sampleCount}</td><td>${Math.round(row.coverage * 100)}%</td><td>${row.averageCalibratedDbSpl == null ? '—' : number(row.averageCalibratedDbSpl) + ' dB SPL'}</td></tr>`) : html`<tr><td colspan="5">Шинэ, хүчинтэй хэмжилттэй интервал алга. Хоосон үед утга зохиохгүй.</td></tr>`}
        </tbody></table></div>
        <p class="muted">Хамрах хүрээ нь ${data.expectedIntervalSeconds} секундийн сорьцын хүлээгдэж буй давтамжаар тооцсон үнэлгээ. Хоцорч ирсэн хуучирсан хэмжилт дундажид орохгүй. ${source === 'simulated' ? 'Симуляцын интервал нь бодит сургалтын өгөгдөл биш.' : 'Энэ нь түүхэн хэмжилт; ирээдүйн таамаг биш.'}</p>
        <div class="adm-scroll"><table class="adm-t"><thead><tr><th>Сүүлийн хэмжилт</th><th>Хүн</th><th>Дуу</th><th>Ирэх үеийн төлөв</th>${this.props.role !== 'public' ? html`<th>Батарей / °C</th>` : ''}</tr></thead><tbody>
          ${data.readings.length ? data.readings.slice(0, 12).map(row => html`<tr data-history-reading><td>${sensorTime(row.timestamp)}</td><td>${row.observedPeople ?? '—'}</td><td>${noiseText(row.noise)}</td><td>${row.staleAtArrival ? 'Хоцорсон / stale' : 'Шинэ'}</td>${this.props.role !== 'public' ? html`<td>${row.batteryPercent ?? '—'}% / ${row.batteryTemperatureC ?? '—'} °C</td>` : ''}</tr>`) : html`<tr><td colspan="5">Энэ эх үүсвэрийн хэмжилт алга.</td></tr>`}
        </tbody></table></div>`}
    </div>`;
  }
}
