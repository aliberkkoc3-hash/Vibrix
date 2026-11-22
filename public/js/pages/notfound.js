/* Vibrix — 404 */
import { icon } from '../icons.js';

export async function render({ main }) {
  main.innerHTML = `
    <div class="page narrow">
      <div class="card empty-state" style="padding:70px 24px">
        <div class="eyebrow">404</div>
        <h1 style="margin:10px 0">Sayfa bulunamadı</h1>
        <p>Aradığın sayfa taşınmış veya hiç var olmamış olabilir.</p>
        <div style="margin-top:20px"><a class="btn btn-primary" href="/" data-link>${icon('home')} Ana Sayfaya Dön</a></div>
      </div>
    </div>`;
}
