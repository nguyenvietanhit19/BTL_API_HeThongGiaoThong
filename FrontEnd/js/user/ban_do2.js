/* ============================================================
   BAN_DO.JS — GiaoThông AnToàn
   Kết nối Flask API + Mapbox GL JS
   ============================================================ */

'use strict';

/* ---------- CONFIG ---------- */
const API_BASE = window.API_BASE || 'http://127.0.0.1:5000';
const MAPBOX_TOKEN = 'mytoken'; // 
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
let pendingDirectionsRequest = null;
let openedFromEmployeePage = false;
let openedFromAdminPage = false;

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

let allMyReports = [];
let currentMyFilter = 'all';
let currentMyLoai = 0; // thêm cạnh currentMyFilter

/* ============================================================
   INIT
   ============================================================ */
// Sửa lại phần init — thêm user_id
// Khi trở lại trang bản đồ từ bfcache, reload báo cáo
window.addEventListener('pageshow', function (e) {
  if (e.persisted) {
    if (typeof loadReportsNearby === 'function') loadReportsNearby();
    if (typeof loadMyReports === 'function') loadMyReports();
  }
});

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
  batDauPollingThongBao();
  openedFromEmployeePage = isOpenedFromEmployeePage();    //từ nhân viên
  openedFromAdminPage = isOpenedFromAdminPage();
  pendingDirectionsRequest = readPendingDirectionsRequest();   //từ nhân viên
  setupEmployeeBackButton();

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
      <div style="display:flex;align-items:center;gap:8px">
        <span class="profile-info-value" id="display-ho-ten">${hoTen}</span>
        <button class="btn-edit-name" onclick="batDauSuaTen()">✏️</button>
      </div>
    </div>

    <div class="profile-edit-row" id="edit-ten-row" style="display:none">
      <input type="text" id="input-ho-ten" value="${hoTen}" maxlength="100"
        placeholder="Nhập họ tên mới..." />
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-secondary" style="flex:1;padding:8px" onclick="huyDoiTen()">Huỷ</button>
        <button class="btn-primary" style="flex:1;padding:8px" onclick="luuDoiTen()">Lưu</button>
      </div>
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

function batDauSuaTen() {
  $('#edit-ten-row').show();
  $('#input-ho-ten').focus();
}

function huyDoiTen() {
  $('#edit-ten-row').hide();
}

function luuDoiTen() {
  const hoTenMoi = $('#input-ho-ten').val().trim();
  if (!hoTenMoi) { showToast('Họ tên không được để trống', 'error'); return; }

  const token = localStorage.getItem('token');
  $.ajax({
    url: API_BASE + '/auth/toi',
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: JSON.stringify({ ho_ten: hoTenMoi }),
    success: () => {
      localStorage.setItem('ho_ten', hoTenMoi);
      $('#display-ho-ten').text(hoTenMoi);
      $('#user-name-display').text(hoTenMoi);
      $('#avatar-text').text(hoTenMoi.charAt(0).toUpperCase());
      $('#edit-ten-row').hide();
      showToast('✅ Cập nhật tên thành công!', 'success');
    },
    error: xhr => showToast('❌ ' + (xhr.responseJSON?.loi || 'Cập nhật thất bại'), 'error')
  });
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

  // ✅ THÊM DÒNG NÀY
  map.addControl(window.directionsControl, 'top-left');

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

  map.on('load', () => {
    applyPendingDirections();
  });

  // Cho phép vuốt ngang filter bar trên mobile (Mapbox chiếm touch events)
  const filterBar = document.querySelector('.filter-bar');
  if (filterBar) {
    let startX = 0, startScrollLeft = 0, isDragging = false;

    filterBar.addEventListener('touchstart', e => {
      e.stopPropagation();
      startX = e.touches[0].pageX;
      startScrollLeft = filterBar.scrollLeft;
      isDragging = true;
    }, { passive: true });

    filterBar.addEventListener('touchmove', e => {
      e.stopPropagation();
      if (!isDragging) return;
      const dx = startX - e.touches[0].pageX;
      filterBar.scrollLeft = startScrollLeft + dx;
    }, { passive: true });

    filterBar.addEventListener('touchend', e => {
      e.stopPropagation();
      isDragging = false;
    }, { passive: true });
  }
}

/* ============================================================
   GEO LOCATION
   ============================================================ */
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?language=vi&access_token=${MAPBOX_TOKEN}`
    );
    const data = await res.json();
    if (data.features && data.features.length > 0) {
      return data.features[0].place_name;
    }
  } catch (e) {}
  return '';
}

async function diaChiTuGPS() {
  if (!currentLat || !currentLng) {
    showToast('Chưa lấy được vị trí GPS', 'error');
    return;
  }
  const btn = document.getElementById('btn-dia-chi-gps');
  btn.textContent = '⏳ Đang lấy...';
  btn.disabled = true;
  const addr = await reverseGeocode(currentLat, currentLng);
  btn.textContent = '📍 Vị trí hiện tại';
  btn.disabled = false;
  if (addr) {
    document.getElementById('dia-chi').value = addr;
  } else {
    showToast('Không lấy được địa chỉ, vui lòng nhập thủ công', 'error');
  }
}

function getUserLocation() {
  if (!navigator.geolocation) {
    document.getElementById('location-text').textContent = 'Trình duyệt không hỗ trợ GPS';
    loadReportsNearby();
    applyPendingDirections();
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
      applyPendingDirections();
    },
    err => {
      document.getElementById('location-text').textContent = 'Không lấy được vị trí, hiển thị toàn bộ';
      document.getElementById('gps-text').textContent = 'Không lấy được GPS — nhập thủ công';
      loadReportsNearby();
      applyPendingDirections();
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
  if (tab === 'map') loadReportsNearby();
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
      allMyReports = res.data || [];
      const badge = document.getElementById('badge-count');
      if (allMyReports.length > 0) {
        badge.textContent = allMyReports.length;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
      filterMyReports();
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

function selectMyFilter(tt, btn) {
  currentMyFilter = tt;
  document.querySelectorAll('.my-filter-chips .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  filterMyReports();
}

function selectMyLoai(loaiId, btn) {
  currentMyLoai = loaiId;
  document.querySelectorAll('#my-loai-chips .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  filterMyReports();
}

function filterMyReports() {
  const keyword = (document.getElementById('search-my-reports')?.value || '').toLowerCase().trim();
  const list = document.getElementById('my-reports-list');
  const loaiNames = { 'Ổ gà': 1, 'Ngập nước': 2, 'Đèn tín hiệu hỏng': 3, 'Tai nạn': 4, 'Vật cản': 5, 'Khác': 6 };

  let filtered = allMyReports;

  // Lọc theo trạng thái
  if (currentMyFilter !== 'all') {
    filtered = filtered.filter(r => r.trang_thai === currentMyFilter);
  }

  // Lọc theo loại sự cố
  if (currentMyLoai !== 0) {
    filtered = filtered.filter(r => (loaiNames[r.loai_su_co] || 6) === currentMyLoai);
  }

  // Lọc theo từ khóa
  if (keyword) {
    filtered = filtered.filter(r =>
      (r.tieu_de || '').toLowerCase().includes(keyword) ||
      (r.dia_chi || '').toLowerCase().includes(keyword)
    );
  }

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <h3>Không tìm thấy</h3>
        <p>Thử thay đổi bộ lọc hoặc từ khóa</p>
      </div>`;
    return;
  }

  list.innerHTML = filtered.map(r => reportCard(r)).join('');
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

      ${(r.trang_thai === 'cho_duyet' || r.trang_thai === 'tu_choi') ? `
      <div style="margin-top:10px;text-align:right">
        <button class="btn-delete-report"
          onclick="event.stopPropagation(); xoaBaoCao(${r.bao_cao_id})">
          🗑️ Xóa báo cáo
        </button>
      </div>` : ''}
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
                    <span class="meta-item">📅 ${formatDate(t.ngay_tao)}</span>
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

  // Reset input để có thể chọn lại cùng file nếu muốn (chọn 2 ảnh giống nhau vẫn được)
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

  //lấy ra vĩ độ, kinh độ từ <input type="hidden" id="vi-do" /> (và nó được chuyền dữ liệu từ js từ hàm getUserLocation)
  const viDo = document.getElementById('vi-do').value;
  const kinhDo = document.getElementById('kinh-do').value;
  if (!viDo || !kinhDo) { showToast('Chưa lấy được vị trí GPS', 'error'); return; }

  const diaChi = document.getElementById('dia-chi').value.trim();
  if (!diaChi) { showToast('Vui lòng nhập địa chỉ', 'error'); return; }


  //chặn ko cho ng dùng bấm gửi nhiều lần
  const btn = document.getElementById('submit-btn'); //lấy ra nút submit và disable nó để k ấn được nhiều lần
  const txt = document.getElementById('submit-text');
  btn.disabled = true;
  txt.textContent = '⏳ Đang gửi...'; //đỏi text của nút gửi

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
      showToast('🎉 Cảm ơn đóng góp báo cáo của bạn!', 'success');
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

function readPendingDirectionsRequest() {
  const params = new URLSearchParams(window.location.search);
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));

  if (params.get('route') !== '1' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    lat: lat,
    lng: lng,
    reportId: params.get('reportId') || '',
    title: params.get('title') || ''
  };
}

function isOpenedFromEmployeePage() {
  const params = new URLSearchParams(window.location.search);
  const hasEmployeeSource = params.get('source') === 'nhan_vien';
  const isEmployeeAccount = localStorage.getItem('vai_tro') === 'nhan_vien';
  const isDirectionsMode = params.get('route') === '1';

  return hasEmployeeSource || (isEmployeeAccount && isDirectionsMode);
}

function isOpenedFromAdminPage() {
  const params = new URLSearchParams(window.location.search);
  const hasAdminSource = params.get('source') === 'admin';
  const isAdminAccount = localStorage.getItem('vai_tro') === 'admin';
  const isDirectionsMode = params.get('route') === '1';

  return hasAdminSource || (isAdminAccount && isDirectionsMode);
}

function setupEmployeeBackButton() {
  const btn = document.getElementById('btn-back-employee');
  if (!btn) return;

  if (openedFromAdminPage) {
    btn.hidden = false;
    btn.textContent = '← Admin';
    return;
  }

  if (openedFromEmployeePage) {
    btn.hidden = false;
    btn.textContent = '← Nhân viên';
    return;
  }

  btn.hidden = true;
}

function goBackToEmployeePage() {
  const fallbackUrl = openedFromAdminPage
    ? '../admin/tong-quan.html'
    : '../NhanVien/nhanVien.html';

  if ((openedFromEmployeePage || openedFromAdminPage) && window.history.length > 1) {
    window.history.back();
    return;
  }

  window.location.href = fallbackUrl;
}

function applyPendingDirections() {
  if (!pendingDirectionsRequest || !map || !window.directionsControl) return;

  switchTab('map');

  if (!Number.isFinite(currentLat) || !Number.isFinite(currentLng)) return;

  window.directionsControl.setOrigin([currentLng, currentLat]);

  window.directionsControl.setDestination([pendingDirectionsRequest.lng, pendingDirectionsRequest.lat]);
  map.flyTo({ center: [pendingDirectionsRequest.lng, pendingDirectionsRequest.lat], zoom: 15, duration: 1200 });

  const btn = document.getElementById('btn-toggle-directions');
  const ctrlLeft = document.querySelector('.mapboxgl-ctrl-top-left');
  if (btn && ctrlLeft) {
    ctrlLeft.classList.add('show-directions');
    btn.classList.add('active');
    btn.textContent = '✕';
  }

  pendingDirectionsRequest = null;
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

function xoaBaoCao(id) {
  if (!confirm('Bạn có chắc muốn xóa báo cáo này không?')) return;

  const token = localStorage.getItem('token');
  $.ajax({
    url: `${API_BASE}/bao-cao/${id}`,
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
    success: () => {
      showToast('🗑️ Đã xóa báo cáo', 'success');
      loadMyReports();
    },
    error: xhr => showToast('❌ ' + (xhr.responseJSON?.loi || 'Xóa thất bại'), 'error')
  });
}


function toggleDirections() {
    const btn = document.getElementById('btn-toggle-directions');
    const ctrlLeft = document.querySelector('.mapboxgl-ctrl-top-left');

    const isShowing = ctrlLeft.classList.toggle('show-directions');
    btn.classList.toggle('active', isShowing);
    btn.textContent = isShowing ? '✕' : '🚘';

    // Nếu tắt thì xóa origin/destination để directions sạch
    if (!isShowing) {
        window.directionsControl.removeRoutes();
    }
}

// function xoaBuocDi() {
//   // Xóa tất cả element chứa danh sách bước đi
//   const selectors = [
//     '.directions-control-instructions',
//     '.mapbox-directions-steps',
//     '.mapbox-directions-route-summary',
//     '.directions-route-summary'
//   ];

//   selectors.forEach(sel => {
//     document.querySelectorAll(sel).forEach(el => el.remove());
//   });
// }

/* ============================================================
   THÔNG BÁO — polling mỗi 30 giây
   ============================================================ */
function batDauPollingThongBao() {
  const token = localStorage.getItem('token');
  if (!token) return;

  async function kiemTraThongBao() {
    const tuId = parseInt(localStorage.getItem('last_lich_su_id') || '0');
    try {
      const res = await fetch(`${API_BASE}/bao-cao/thong-bao?tu_id=${tuId}`, {
        headers: {
          'Authorization': 'Bearer ' + token,
          'ngrok-skip-browser-warning': 'true'
        }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return;

      // Cập nhật last_lich_su_id
      const maxId = Math.max(...data.map(n => n.lich_su_id));
      localStorage.setItem('last_lich_su_id', maxId);

      // Tự động reload danh sách báo cáo
      if (typeof loadReportsNearby === 'function') loadReportsNearby();

      // Hiện toast cho từng thông báo
      data.forEach((tb, i) => {
        setTimeout(() => {
          showToastThongBao(tb.noi_dung, tb.tieu_de);
        }, i * 1500);
      });
    } catch (e) {}
  }

  // Chạy ngay lần đầu sau 2 giây, rồi mỗi 30 giây
  setTimeout(kiemTraThongBao, 300);
  setInterval(kiemTraThongBao, 300);
}

function showToastThongBao(noiDung, tieuDe) {
  let container = document.getElementById('thongbao-stack');
  if (!container) {
    container = document.createElement('div');
    container.id = 'thongbao-stack';
    container.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;z-index:9999;width:90%;max-width:320px;';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.style.cssText = 'background:#1a1a2e;color:#fff;border-left:4px solid #4285F4;padding:12px 16px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.4);font-size:13px;line-height:1.5;animation:slideUp .3s ease;cursor:pointer;';
  el.innerHTML = `<div style="font-weight:700;margin-bottom:4px">🔔 Thông báo</div><div>${noiDung}</div><div style="color:rgba(255,255,255,.5);font-size:11px;margin-top:4px">${tieuDe}</div>`;
  el.onclick = () => el.remove();
  container.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

