/* ============================================================
   BAN_DO.JS — GiaoThông AnToàn
   Kết nối Flask API + Mapbox GL JS
   ============================================================ */

'use strict';

/* ---------- CONFIG ---------- */
const API_BASE = 'http://localhost:5000';         // Sửa thành URL deploy nếu cần
const MAPBOX_TOKEN = 'my_mapbox_token_here'; // ← thay bằng token của bạn
const BAN_KINH_KM = 10;

/* ---------- STATE ---------- */
let currentLat = null;
let currentLng = null;
let map = null;
let markers = {};           // { bao_cao_id: mapboxMarker }
let allReports = [];
let currentFilter = 0;          // 0 = tất cả
let selectedFiles = [];
let selectedLoaiId = null;
let activePopup = null;

/* ---------- LOẠI SỰ CỐ ---------- */
const LOAI_CONFIG = {
  1: { emoji: '🕳️', color: '#E24B4A', label: 'Ổ gà' },
  2: { emoji: '💧', color: '#378ADD', label: 'Ngập nước' },
  3: { emoji: '🚦', color: '#EF9F27', label: 'Đèn hỏng' },
  4: { emoji: '⚠️', color: '#A32D2D', label: 'Tai nạn' },
  5: { emoji: '🚧', color: '#7F77DD', label: 'Vật cản' },
  6: { emoji: '❓', color: '#888780', label: 'Khác' },
};

/* ---------- TRẠNG THÁI ---------- */
const TRANG_THAI_CONFIG = {
  cho_duyet: { label: 'Chờ duyệt', color: '#F59E0B', step: 1, emoji: '⏳' },
  da_duyet: { label: 'Đã duyệt', color: '#3B82F6', step: 2, emoji: '✅' },
  da_phan_cong: { label: 'Đã phân công', color: '#8B5CF6', step: 2, emoji: '👷' },
  dang_xu_ly: { label: 'Đang xử lý', color: '#06B6D4', step: 3, emoji: '🔧' },
  cho_nghiem_thu: { label: 'Chờ nghiệm thu', color: '#F97316', step: 3, emoji: '🔍' },
  da_xu_ly: { label: 'Đã xử lý', color: '#22C55E', step: 4, emoji: '🎉' },
  tu_choi: { label: 'Bị từ chối', color: '#EF4444', step: 0, emoji: '❌' },
};

/* ============================================================
   INIT
   ============================================================ */
// Sửa lại phần init — thêm user_id
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '../dang_nhap/dang_nhap.html';
    return;
  }

  const hoTen = localStorage.getItem('ho_ten') || 'Người dùng';
  const vaiTro = localStorage.getItem('vai_tro') || 'user';

  document.getElementById('user-name-display').textContent = hoTen;
  document.getElementById('avatar-text').textContent = hoTen.charAt(0).toUpperCase();

  // Gọi API lấy thông tin user để có ID
  taiThongTinUser();

  initMap();
  getUserLocation();
});


function taiThongTinUser() {
  const token = localStorage.getItem('token');
  $.ajax({
    url: API_BASE + '/auth/toi',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
    success: res => {
      // Hiện ID dưới tên
      const id = res.nguoi_dung_id || '';
      $('#user-id-display').text(`#${String(id).padStart(4, '0')}`);

      // Lưu vào localStorage để dùng sau
      localStorage.setItem('nguoi_dung_id', id);
      localStorage.setItem('email', res.email || '');
      localStorage.setItem('ngay_tao', res.ngay_tao || ''); // ← thêm dòng này
    }
  });
}

// Mở modal thông tin
function moThongTin() {
  $('#user-dropdown').removeClass('open');
  $('#thong-tin-overlay, #thong-tin-modal').addClass('open');

  const hoTen = localStorage.getItem('ho_ten') || 'Người dùng';
  const vaiTro = localStorage.getItem('vai_tro') || 'user';
  const email = localStorage.getItem('email') || '...';
  const id = localStorage.getItem('nguoi_dung_id') || '?';
  const ngayTao = localStorage.getItem('ngay_tao') || '';

  $('#thong-tin-content').html(`
        <div class="profile-avatar-lg">${hoTen.charAt(0).toUpperCase()}</div>

        <div class="profile-info-row">
            <span class="profile-info-label">Họ tên</span>
            <span class="profile-info-value">${hoTen}</span>
        </div>
        <div class="profile-info-row">
            <span class="profile-info-label">Mã người dùng</span>
            <span class="profile-info-value">#${String(id).padStart(4, '0')}</span>
        </div>
        <div class="profile-info-row">
            <span class="profile-info-label">Email</span>
            <span class="profile-info-value">${email}</span>
        </div>
        <div class="profile-info-row">
            <span class="profile-info-label">Vai trò</span>
            <span class="profile-info-value">${vaiTroLabel(vaiTro)}</span>
        </div>
        <div class="profile-info-row">
            <span class="profile-info-label">Ngày tham gia</span>
            <span class="profile-info-value">${ngayTao ? formatDate(ngayTao) : '—'}</span>
        </div>
    `);
}

function dongThongTin() {
  $('#thong-tin-overlay, #thong-tin-modal').removeClass('open');
}

function vaiTroLabel(vt) {
  return { admin: 'Quản trị viên', nhan_vien: 'Nhân viên', user: 'Người dùng' }[vt] || vt;
}

/* ============================================================
   MAPBOX INIT
   ============================================================ */
function initMap() {
  mapboxgl.accessToken = MAPBOX_TOKEN;

  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/standard',
    center: [105.8412, 21.0245],   // Hà Nội
    zoom: 12,
  });

  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-left');
  map.addControl(new mapboxgl.FullscreenControl(), 'bottom-left');

  // ✅ Thêm directions
  window.directionsControl = new MapboxDirections({
    accessToken: MAPBOX_TOKEN,
    unit: 'metric',
    profile: 'mapbox/driving',
    language: 'vi',
    controls: { profileSwitcher: true, inputs: true }
  });

  map.addControl(
    new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,  // chỉ nhảy về 1 lần, không track liên tục
      showUserHeading: true,
      showUserLocation: true
    }),
    'bottom-left'
  );

  map.on('click', () => {
    if (activePopup) { activePopup.remove(); activePopup = null; }
  });
}

/* ============================================================
   GEO LOCATION
   ============================================================ */
function getUserLocation() {
  if (!navigator.geolocation) {
    document.getElementById('location-text').textContent = 'Trình duyệt không hỗ trợ GPS';
    loadReportsNearby();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      currentLat = pos.coords.latitude;
      currentLng = pos.coords.longitude;

      // Fly to user location
      map.flyTo({ center: [currentLng, currentLat], zoom: 13, duration: 1600 });

      // User location marker
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="width:18px;height:18px;border-radius:50%;
          background:#4285F4;border:3px solid #fff;
          box-shadow:0 2px 8px rgba(66,133,244,.6);
          animation:pulse 2s infinite;">
        </div>`;
      new mapboxgl.Marker({ element: el })
        .setLngLat([currentLng, currentLat])
        .addTo(map);

      // 10km radius circle
      map.on('load', () => addRadiusCircle(currentLat, currentLng));
      if (map.isStyleLoaded()) addRadiusCircle(currentLat, currentLng);

      document.getElementById('location-text').textContent =
        `Hiển thị sự cố trong ${BAN_KINH_KM}km quanh bạn`;
      setTimeout(() => document.getElementById('location-bar').classList.add('hidden'), 4000);

      document.getElementById('gps-text').textContent =
        `${currentLat.toFixed(6)}, ${currentLng.toFixed(6)}`;
      document.getElementById('vi-do').value = currentLat;
      document.getElementById('kinh-do').value = currentLng;

      loadReportsNearby();
    },
    err => {
      document.getElementById('location-text').textContent = 'Không lấy được vị trí, hiển thị toàn bộ';
      document.getElementById('gps-text').textContent = 'Không lấy được GPS — nhập thủ công';
      loadReportsNearby();
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function addRadiusCircle(lat, lng) {
  const id = 'radius-circle';
  if (map.getSource(id)) return;

  // Tạo polygon tròn
  const pts = 64;
  const coords = [];
  const R = 6371;
  const d = BAN_KINH_KM / R;
  for (let i = 0; i <= pts; i++) {
    const brng = (i * 360 / pts) * Math.PI / 180;
    const latR = lat * Math.PI / 180;
    const lngR = lng * Math.PI / 180;
    const pLat = Math.asin(Math.sin(latR) * Math.cos(d) + Math.cos(latR) * Math.sin(d) * Math.cos(brng));
    const pLng = lngR + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(latR), Math.cos(d) - Math.sin(latR) * Math.sin(pLat));
    coords.push([pLng * 180 / Math.PI, pLat * 180 / Math.PI]);
  }

  map.addSource(id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } } });
  map.addLayer({ id: id, type: 'fill', source: id, paint: { 'fill-color': '#FF5722', 'fill-opacity': 0.05 } });
  map.addLayer({ id: id + '-border', type: 'line', source: id, paint: { 'line-color': '#FF5722', 'line-width': 1.5, 'line-dasharray': [4, 3], 'line-opacity': 0.4 } });
}

/* ============================================================
   LOAD REPORTS (API)
   ============================================================ */
function loadReportsNearby() {
  $.ajax({
    url: API_BASE + '/bao-cao',
    method: 'GET',
    success: res => {
      allReports = res.data || [];
      renderMarkers(allReports);
    },
    error: xhr => showToast('⚠️ ' + (xhr.responseJSON?.loi || 'Lỗi tải dữ liệu'), 'error')
  });
}

/* ============================================================
   MARKERS
   ============================================================ */
function renderMarkers(reports) {
  // Xóa TẤT CẢ markers cũ trước
  Object.keys(markers).forEach(id => {
    markers[id].remove();
    delete markers[id];
  });

  // Vẽ lại từ đầu theo list mới từ API
  reports.forEach(r => {
    const loai = getLoaiFromReport(r);

    const el = document.createElement('div');
    el.className = 'marker-wrap';
    el.innerHTML = `
            <div class="marker-pin" style="background:${loai.color}">
                <span class="marker-emoji">${loai.emoji}</span>
            </div>
            <div class="marker-pulse" style="background:${loai.color}"></div>
        `;

    el.addEventListener('click', e => {
      e.stopPropagation();
      showPopup(r);
    });

    const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([parseFloat(r.kinh_do), parseFloat(r.vi_do)])
      .addTo(map);

    markers[r.bao_cao_id] = marker;
  });
}

function showPopup(report) {
  if (activePopup) activePopup.remove();

  const tt = TRANG_THAI_CONFIG[report.trang_thai] || {};
  const loai = getLoaiFromReport(report);

  activePopup = new mapboxgl.Popup({ offset: 25, closeButton: true })
    .setLngLat([parseFloat(report.kinh_do), parseFloat(report.vi_do)])
    .setHTML(`
      <strong>${report.tieu_de}</strong>
      <small>${loai.label || ''} · ${tt.emoji || ''} ${tt.label || report.trang_thai}</small>
      ${report.dia_chi ? `<small style="display:block;margin-top:4px">📍 ${report.dia_chi}</small>` : ''}
      <button class="popup-btn" onclick="openDetailPanel(${report.bao_cao_id})">Xem chi tiết →</button>
    `)
    .addTo(map);
}

function getLoaiFromReport(r) {
  // v_bao_cao_day_du có trường loai_su_co (tên), nhưng ta cần map loai_su_co_id
  // Fallback: lấy từ ten_loai hoặc loai_su_co
  const loaiNames = { 'Ổ gà': 1, 'Ngập nước': 2, 'Đèn tín hiệu hỏng': 3, 'Tai nạn': 4, 'Vật cản': 5, 'Khác': 6 };
  const id = loaiNames[r.loai_su_co] || 6;
  return LOAI_CONFIG[id] || LOAI_CONFIG[6];
}

/* ============================================================
   FILTER
   ============================================================ */
function filterByLoai(loaiId, btn) {
  currentFilter = loaiId;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');

  const filtered = loaiId === 0
    ? allReports
    : allReports.filter(r => {
      const loaiNames = { 'Ổ gà': 1, 'Ngập nước': 2, 'Đèn tín hiệu hỏng': 3, 'Tai nạn': 4, 'Vật cản': 5, 'Khác': 6 };
      return (loaiNames[r.loai_su_co] || 6) === loaiId;
    });

  renderMarkers(filtered);
}

/* ============================================================
   TAB SWITCH
   ============================================================ */
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === `tab-${tab}`);
  });

  if (tab === 'my-reports') loadMyReports();
}

/* ============================================================
   MY REPORTS
   ============================================================ */
function loadMyReports() {
  const list = document.getElementById('my-reports-list');
  list.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Đang tải...</p></div>`;
  const token = localStorage.getItem('token');

  $.ajax({
    url: API_BASE + '/bao-cao/cua-toi',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
    success: res => {
      const reports = res.data || [];
      const badge = document.getElementById('badge-count');

      if (reports.length > 0) {
        badge.textContent = reports.length;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }

      if (reports.length === 0) {
        list.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📭</div>
                        <h3>Chưa có báo cáo nào</h3>
                        <p>Hãy gửi báo cáo đầu tiên của bạn!</p>
                    </div>`;
        return;
      }

      list.innerHTML = reports.map(r => reportCard(r)).join('');
    },
    error: xhr => {
      list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <h3>Không tải được dữ liệu</h3>
                    <p>${xhr.responseJSON?.loi || 'Lỗi không xác định'}</p>
                </div>`;
    }
  });
}

function reportCard(r) {
  const tt = TRANG_THAI_CONFIG[r.trang_thai] || { label: r.trang_thai, color: '#888', step: 0, emoji: '' };
  const loai = getLoaiFromReport(r);
  const steps = ['Gửi', 'Duyệt', 'Xử lý', 'Xong'];
  const pct = tt.step === 0 ? 0 : ((tt.step - 1) / 3) * 100;
  const isTuChoi = r.trang_thai === 'tu_choi';

  const stepsHtml = steps.map((s, i) => {
    const stepNum = i + 1;
    let cls = 'step-dot';
    let labelCls = 'step-label';
    if (stepNum < tt.step) { cls += ' done'; labelCls += ' done'; }
    if (stepNum === tt.step) { cls += ' current'; labelCls += ' current'; }
    return `<div class="${cls}" style="${stepNum <= tt.step && !isTuChoi ? `background:${tt.color};box-shadow:0 0 0 2px ${tt.color}33` : ''}"></div>`;
  }).join('');

  const labelsHtml = steps.map((s, i) => {
    const stepNum = i + 1;
    let cls = 'step-label';
    if (stepNum <= tt.step && !isTuChoi) { cls += ' done'; }
    if (stepNum === tt.step) { cls += ' current'; }
    const check = (stepNum < tt.step && !isTuChoi) ? ' ✓' : '';
    return `<span class="${cls}" style="${stepNum === tt.step && !isTuChoi ? `color:${tt.color}` : ''}">${s}${check}</span>`;
  }).join('');

  return `
    <div class="report-card" onclick="openDetailPanel(${r.bao_cao_id})"
      style="--accent-color:${tt.color}">
      <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${tt.color};border-radius:4px 0 0 4px"></div>
      <div class="report-card-header">
        <div class="report-card-title">${loai.emoji} ${r.tieu_de}</div>
        <span class="status-badge" style="background:${tt.color}18;color:${tt.color}">
          ${tt.emoji} ${tt.label}
        </span>
      </div>
      <div class="report-card-addr">
        📍 ${r.dia_chi || 'Không có địa chỉ'} · ${timeAgo(r.ngay_tao)}
      </div>
      ${!isTuChoi ? `
      <div class="progress-track">
        <div class="progress-steps">
          <div class="progress-fill" style="width:${pct}%;background:${tt.color}"></div>
          ${stepsHtml}
        </div>
        <div class="progress-labels">${labelsHtml}</div>
      </div>` : `
      <div style="font-size:12px;color:#EF4444;margin-top:4px">❌ Báo cáo đã bị từ chối</div>`}
    </div>`;
}

/* ============================================================
   DETAIL PANEL
   ============================================================ */
function openDetailPanel(baoCapId) {
  if (activePopup) { activePopup.remove(); activePopup = null; }

  document.getElementById('panel-overlay').classList.add('open');
  document.getElementById('detail-panel').classList.add('open');
  document.getElementById('detail-content').innerHTML =
    `<div class="loading-state"><div class="spinner"></div><p>Đang tải...</p></div>`;

  $.ajax({
    url: `${API_BASE}/bao-cao/${baoCapId}`,
    method: 'GET',
    success: res => {
      const { thong_tin: t, hinh_anh, lich_su } = res.data;
      const tt = TRANG_THAI_CONFIG[t.trang_thai] || { label: t.trang_thai, color: '#888', emoji: '' };
      const loai = getLoaiFromReport(t);

      const imagesHtml = hinh_anh.length
        ? `<div class="panel-images">
                    ${hinh_anh.map(a =>
          `<img class="panel-img" src="${a.duong_dan_anh}" alt="${a.loai_anh}"
                            onclick="window.open('${a.duong_dan_anh}')"
                            onerror="this.style.display='none'" />`
        ).join('')}
                  </div>`
        : '<p style="font-size:13px;color:var(--text-secondary)">Chưa có ảnh</p>';

      const lichSuHtml = lich_su.length
        ? `<ul class="timeline">
                    ${lich_su.map(ls => `
                        <li>
                            <div class="tl-date">${formatDate(ls.ngay_doi)}</div>
                            <div class="tl-text">
                                ${ls.trang_thai_cu
            ? `<span style="color:var(--text-secondary)">${TRANG_THAI_CONFIG[ls.trang_thai_cu]?.label || ls.trang_thai_cu}</span> → `
            : ''}
                                <strong>${TRANG_THAI_CONFIG[ls.trang_thai_moi]?.label || ls.trang_thai_moi}</strong>
                            </div>
                            ${ls.ghi_chu ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${ls.ghi_chu}</div>` : ''}
                            ${ls.ten_nguoi_doi ? `<div style="font-size:12px;color:var(--text-secondary)">by ${ls.ten_nguoi_doi}</div>` : ''}
                        </li>`
        ).join('')}
                  </ul>`
        : '<p style="font-size:13px;color:var(--text-secondary)">Chưa có lịch sử</p>';

      document.getElementById('detail-content').innerHTML = `
                <div class="panel-status-bar">
                    <span class="status-badge" style="background:${tt.color}20;color:${tt.color};font-size:13px">
                        ${tt.emoji} ${tt.label}
                    </span>
                    <span style="font-size:12px;color:var(--text-secondary)">${timeAgo(t.ngay_tao)}</span>
                </div>
                <div class="panel-title">${loai.emoji} ${t.tieu_de}</div>
                <div class="panel-meta">
                    <span class="meta-item">📍 ${t.dia_chi || 'Không có địa chỉ'}</span>
                    <span class="meta-item">👤 ${t.ten_nguoi_gui || ''}</span>
                    ${t.ten_nhan_vien ? `<span class="meta-item">👷 ${t.ten_nhan_vien}</span>` : ''}
                    <span class="meta-item">🏷️ ${t.loai_su_co || ''}</span>
                </div>
                ${t.mo_ta ? `
                <div class="panel-section">
                    <div class="panel-section-label">Mô tả</div>
                    <div class="panel-desc">${t.mo_ta}</div>
                </div>` : ''}
                <div class="panel-section">
                    <div class="panel-section-label">Hình ảnh</div>
                    ${imagesHtml}
                </div>
                <div class="panel-section">
                    <div class="panel-section-label">Lịch sử trạng thái</div>
                    ${lichSuHtml}
                </div>
                <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px;">
    <button onclick="flyToReport(${t.vi_do},${t.kinh_do})"
        style="width:100%;padding:12px;background:var(--navy);color:#fff;border:none;
            border-radius:var(--radius-sm);font-family:'Be Vietnam Pro',sans-serif;
            font-weight:700;font-size:14px;cursor:pointer;
            display:flex;align-items:center;justify-content:center;gap:8px;">
        🗺️ Xem trên bản đồ
    </button>
    <button onclick="chiDuong(${t.vi_do},${t.kinh_do})"
        style="width:100%;padding:12px;background:#4285F4;color:#fff;border:none;
            border-radius:var(--radius-sm);font-family:'Be Vietnam Pro',sans-serif;
            font-weight:700;font-size:14px;cursor:pointer;
            display:flex;align-items:center;justify-content:center;gap:8px;">
        🧭 Chỉ đường
    </button>
</div>`;
    },
    error: xhr => {
      document.getElementById('detail-content').innerHTML =
        `<div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <p>${xhr.responseJSON?.loi || 'Lỗi tải chi tiết'}</p>
                </div>`;
    }
  });
}

function flyToReport(lat, lng) {
  closeDetailPanel();
  switchTab('map');
  setTimeout(() => {
    map.flyTo({ center: [lng, lat], zoom: 16, duration: 1200 });
  }, 300);
}

function closeDetailPanel() {
  document.getElementById('detail-panel').classList.remove('open');
  document.getElementById('panel-overlay').classList.remove('open');
}

/* ============================================================
   REPORT MODAL
   ============================================================ */
function openReportModal() {
  selectedFiles = [];
  selectedLoaiId = null;
  document.getElementById('report-form').reset();
  document.getElementById('image-preview-grid').innerHTML = '';
  document.querySelectorAll('.loai-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('selected-loai').value = '';

  if (currentLat && currentLng) {
    document.getElementById('gps-text').textContent = `${currentLat.toFixed(6)}, ${currentLng.toFixed(6)}`;
    document.getElementById('vi-do').value = currentLat;
    document.getElementById('kinh-do').value = currentLng;
  }

  document.getElementById('report-modal-overlay').classList.add('open');
  document.getElementById('report-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeReportModal() {
  document.getElementById('report-modal').classList.remove('open');
  document.getElementById('report-modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function selectLoai(id, btn) {
  selectedLoaiId = id;
  document.querySelectorAll('.loai-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('selected-loai').value = id;
}

function previewImages(e) {
  const newFiles = Array.from(e.target.files);
  if (!newFiles.length) return;

  // Cộng dồn vào selectedFiles thay vì gán lại
  selectedFiles = [...selectedFiles, ...newFiles];

  renderPreview();

  // Reset input để có thể chọn lại cùng file nếu muốn
  e.target.value = '';
}

function renderPreview() {
  const grid = document.getElementById('image-preview-grid');
  grid.innerHTML = '';

  selectedFiles.forEach((file, i) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const item = document.createElement('div');
      item.className = 'preview-item';
      item.innerHTML = `
        <img src="${ev.target.result}" alt="preview" />
        <button class="preview-remove" onclick="removeImage(${i})">✕</button>`;
      grid.appendChild(item);
    };
    reader.readAsDataURL(file);
  });
}

function removeImage(idx) {
  selectedFiles.splice(idx, 1);
  renderPreview();
}

function submitReport(e) {
  e.preventDefault();
  if (!selectedLoaiId) { showToast('Vui lòng chọn loại sự cố', 'error'); return; }
  if (selectedFiles.length === 0) { showToast('Vui lòng chọn ít nhất 1 ảnh', 'error'); return; }

  const viDo = document.getElementById('vi-do').value;
  const kinhDo = document.getElementById('kinh-do').value;
  if (!viDo || !kinhDo) { showToast('Chưa lấy được vị trí GPS', 'error'); return; }

  const btn = document.getElementById('submit-btn');
  const txt = document.getElementById('submit-text');
  btn.disabled = true;
  txt.textContent = '⏳ Đang gửi...';

  const token = localStorage.getItem('token');
  const fd = new FormData();
  fd.append('loai_su_co_id', selectedLoaiId);
  fd.append('tieu_de', document.getElementById('tieu-de').value.trim());
  fd.append('mo_ta', document.getElementById('mo-ta').value.trim());
  fd.append('dia_chi', document.getElementById('dia-chi').value.trim());
  fd.append('vi_do', viDo);
  fd.append('kinh_do', kinhDo);
  selectedFiles.forEach(f => fd.append('anh', f));

  $.ajax({
    url: API_BASE + '/bao-cao',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    data: fd,
    processData: false,
    contentType: false,
    success: res => {
      showToast('🎉 Gửi báo cáo thành công!', 'success');
      closeReportModal();
      loadReportsNearby();
    },
    error: xhr => {
      showToast('❌ ' + (xhr.responseJSON?.loi || 'Gửi thất bại'), 'error');
    },
    complete: () => {
      btn.disabled = false;
      txt.textContent = '🚀 Gửi báo cáo';
    }
  });
}

/* ============================================================
   USER MENU
   ============================================================ */
function toggleUserMenu() {
  $('#user-dropdown').toggleClass('open');
}

// Đóng dropdown khi click ngoài
$(document).on('click', e => {
  if (!$(e.target).closest('#user-btn-wrap, #user-dropdown').length) {
    $('#user-dropdown').removeClass('open');
  }
});



function dangXuat() {
  localStorage.clear();
  window.location.href = '../dang_nhap/dang_nhap.html';
}

/* ============================================================
   HELPERS
   ============================================================ */
// Thay apiFetch bằng helper này
// function apiAjax(method, path, data, callback) {
//     const token = localStorage.getItem('token');
//     const isFormData = data instanceof FormData;

//     $.ajax({
//         url: API_BASE + path,
//         method: method,
//         headers: { 'Authorization': `Bearer ${token}` },
//         contentType: isFormData ? false : 'application/json',
//         processData: isFormData ? false : true,
//         data: isFormData ? data : (data ? JSON.stringify(data) : null),
//         success: res => callback(null, res),
//         error: xhr => callback(xhr.responseJSON?.loi || `Lỗi ${xhr.status}`, null)
//     });
// }

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function chiDuong(lat, lng) {
  closeDetailPanel();
  switchTab('map');

  setTimeout(() => {
    if (!map.hasControl(window.directionsControl)) {
      map.addControl(window.directionsControl, 'top-left');
    }

    if (currentLat && currentLng) {
      window.directionsControl.setOrigin([currentLng, currentLat]);
    }
    window.directionsControl.setDestination([lng, lat]);
    map.flyTo({ center: [lng, lat], zoom: 15, duration: 1200 });

    // Chờ directions render xong rồi xóa phần bước đi
    setTimeout(() => xoaBuocDi(), 800);

    // Lắng nghe mỗi khi route thay đổi → xóa lại
    window.directionsControl.on('route', () => {
      setTimeout(() => xoaBuocDi(), 300);
    });

  }, 300);
}

function xoaBuocDi() {
  // Xóa tất cả element chứa danh sách bước đi
  const selectors = [
    '.directions-control-instructions',
    '.mapbox-directions-steps',
    '.mapbox-directions-route-summary',
    '.directions-route-summary'
  ];

  selectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => el.remove());
  });
}