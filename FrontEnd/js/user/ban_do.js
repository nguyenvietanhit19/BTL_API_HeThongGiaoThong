/* =============================================
   BAN_DO.JS — Logic trang người dùng
   Mapbox GL JS v3.20.0 + Standard Style
   ============================================= */

const MAPBOX_TOKEN = 'my_mapbox_token_here'; // ← thay bằng token của bạn từ Mapbox
mapboxgl.accessToken = MAPBOX_TOKEN;

// ===== STATE =====
let mapBanDo = null;
let mapChonViTri = null;
let dsMarker = [];
let viTriChon = null;
let markerChon = null;
let dsCache = [];
let hoveredMarker = null;

// ===== INIT =====
$(document).ready(function () {
    requireLogin();
    khoiTaoNavbarUser();
    khoiTaoBanDo();
    taiDanhSach();
    taiBaoCaoCuaToi();
});

// =============================================
// MAP BẢN ĐỒ CHÍNH — Standard Style v3.20.0
// =============================================
function khoiTaoBanDo() {
    mapBanDo = new mapboxgl.Map({
        container: 'map',
        center: [105.8412, 21.0245], // Hà Nội
        zoom: 13,
        style: 'mapbox://styles/mapbox/standard',
        config: {
            basemap: {
                // Màu highlight khi hover place label
                colorPlaceLabelHighlight: '#E24B4A',
                colorPlaceLabelSelect: '#A32D2D'
            }
        }
    });

    mapBanDo.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

    mapBanDo.on('load', () => {
        if (dsCache.length) renderMarkers(dsCache);
    });

    // Click vào nền map → đóng popup đang mở
    mapBanDo.addInteraction('map-click-bg', {
        type: 'click',
        handler: () => {
            // Không làm gì, chỉ để không propagate lên place-labels
            return false;
        }
    });
}

// =============================================
// RENDER MARKERS
// =============================================
function renderMarkers(ds) {
    dsMarker.forEach(m => m.remove());
    dsMarker = [];

    ds.forEach((item, idx) => {
        if (!item.vi_do || !item.kinh_do) return;

        const mau = mauTheoLoai(item.loai_su_co || item.ten || '');
        const daXong = item.trang_thai === 'da_xu_ly';
        const mauPin = daXong ? '#888780' : mau;

        // Custom marker element
        const el = document.createElement('div');
        el.className = 'custom-marker';
        el.style.cssText = `
            width: 24px; height: 24px;
            background: ${mauPin};
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            border: 2.5px solid white;
            box-shadow: 0 2px 10px rgba(0,0,0,0.28);
            cursor: pointer;
            transition: transform 0.18s, box-shadow 0.18s;
        `;

        el.addEventListener('mouseenter', () => {
            el.style.transform = 'rotate(-45deg) scale(1.25)';
            el.style.boxShadow = '0 4px 16px rgba(0,0,0,0.35)';
        });
        el.addEventListener('mouseleave', () => {
            el.style.transform = 'rotate(-45deg) scale(1)';
            el.style.boxShadow = '0 2px 10px rgba(0,0,0,0.28)';
        });
        el.addEventListener('click', () => chonItemSidebar(idx));

        // Popup
        const popup = new mapboxgl.Popup({
            closeButton: true,
            closeOnClick: false,
            maxWidth: '260px',
            offset: [0, -8]
        }).setHTML(`
            <div class="popup-body">
                <div class="popup-loai">${escHtml(item.loai_su_co || item.ten || 'Sự cố')}</div>
                <div class="popup-title">${escHtml(item.tieu_de || '')}</div>
                <div class="popup-dia-chi">📍 ${escHtml(item.dia_chi || '')}</div>
                <div class="popup-meta">${tinhThoiGian(item.ngay_tao)} · ${escHtml(item.ten_nguoi_gui || '')}</div>
                ${renderBadge(item.trang_thai)}
            </div>
        `);

        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([parseFloat(item.kinh_do), parseFloat(item.vi_do)])
            .setPopup(popup)
            .addTo(mapBanDo);

        dsMarker.push(marker);
    });
}

// =============================================
// SIDEBAR
// =============================================
function renderSidebar(ds, coViTri) {
    if (!ds.length) {
        $('#su-co-list').html('<div class="loading-text">Không có sự cố nào</div>');
        return;
    }

    // Header gợi ý
    const header = coViTri
        ? `<div class="sidebar-hint">📍 Sự cố trong bán kính 10km</div>`
        : `<div class="sidebar-hint">🗺️ Tất cả sự cố</div>`;

    $('#su-co-list').html(header + ds.map((item, i) => {
        const mau = mauTheoLoai(item.loai_su_co || item.ten || '');

        // Hiện khoảng cách nếu có
        const kc = item.khoang_cach_m != null
            ? (item.khoang_cach_m >= 1000
                ? `${(item.khoang_cach_m / 1000).toFixed(1)}km`
                : `${item.khoang_cach_m}m`)
            : '';

        return `
        <div class="su-co-item" id="item-${i}" onclick="chonItemSidebar(${i})">
            <div class="su-co-item-header">
                <div class="su-co-ten">
                    <span class="su-co-dot" style="background:${mau}"></span>
                    ${escHtml(item.tieu_de || 'Sự cố')}
                </div>
                ${renderBadge(item.trang_thai)}
            </div>
            <div class="su-co-dia-chi">${escHtml(item.dia_chi || '')}</div>
            <div class="su-co-meta">
                ${tinhThoiGian(item.ngay_tao)}
                ${item.ten_nguoi_gui ? ' · ' + escHtml(item.ten_nguoi_gui) : ''}
                ${kc ? ` · <strong>${kc}</strong>` : ''}
            </div>
        </div>`;
    }).join(''));
}

function chonItemSidebar(idx) {
    $('.su-co-item').removeClass('selected');
    $(`#item-${idx}`).addClass('selected');

    const item = dsCache[idx];
    if (!item?.vi_do || !item?.kinh_do) return;

    mapBanDo.flyTo({
        center: [parseFloat(item.kinh_do), parseFloat(item.vi_do)],
        zoom: 16,
        duration: 900
    });

    // Mở popup của marker tương ứng
    dsMarker[idx]?.togglePopup();
}

function capNhatStats(ds) {
    $('#stat-cho').text(ds.filter(i => i.trang_thai === 'cho_duyet').length);
    $('#stat-xu-ly').text(ds.filter(i => ['da_phan_cong', 'dang_xu_ly', 'cho_nghiem_thu'].includes(i.trang_thai)).length);
    $('#stat-xong').text(ds.filter(i => i.trang_thai === 'da_xu_ly').length);
}

// =============================================
// TẢI DANH SÁCH SỰ CỐ
// =============================================
function taiDanhSach(loaiId) {
    const token = localStorage.getItem('token');
    $('#su-co-list').html('<div class="loading-text">Đang tải...</div>');

    // Lấy vị trí GPS trước, sau đó gọi API
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            pos => {
                const { latitude: lat, longitude: lng } = pos.coords;
                // Gọi API với bán kính 10km
                goiApiDanhSach(lat, lng, 10, loaiId, token);
            },
            () => {
                // Không lấy được GPS → gọi API không có tọa độ
                goiApiDanhSach(null, null, null, loaiId, token);
            },
            { timeout: 5000 }
        );
    } else {
        goiApiDanhSach(null, null, null, loaiId, token);
    }
}

function goiApiDanhSach(lat, lng, banKinh, loaiId, token) {
    // Build query params
    let params = {};
    if (lat !== null) {
        params.vi_do = lat;
        params.kinh_do = lng;
        params.ban_kinh = banKinh;
    }
    if (loaiId) params.loai_su_co_id = loaiId;

    $.ajax({
        url: `${API}/bao-cao`,
        data: params,
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        success: res => {
            // ✅ API trả về key "data" không phải "bao_cao"
            let ds = res.data || res.bao_cao || (Array.isArray(res) ? res : []);

            if (lat !== null && ds.length === 0) {
                // Không có báo cáo trong 10km → lấy tất cả không lọc bán kính
                $('#su-co-list').html('<div class="loading-text">Không có sự cố gần bạn, hiển thị tất cả...</div>');
                goiApiDanhSach(null, null, null, loaiId, token);
                return;
            }

            dsCache = ds;
            renderSidebar(ds, lat !== null);
            capNhatStats(ds);
            if (mapBanDo?.loaded()) renderMarkers(ds);
            else mapBanDo?.on('load', () => renderMarkers(ds));
        },
        error: () => {
            // Fallback demo data
            const demo = getDemoData();
            dsCache = demo;
            renderSidebar(demo, false);
            capNhatStats(demo);
            if (mapBanDo?.loaded()) renderMarkers(demo);
            else mapBanDo?.on('load', () => renderMarkers(demo));
        }
    });
}

function locSuCo(el, loaiId) {
    $('.filter-chip').removeClass('active');
    $(el).addClass('active');
    taiDanhSach(loaiId);
}

// =============================================
// ĐỊNH VỊ GPS
// =============================================
function dinhViHienTai() {
    const btn = document.getElementById('btn-dinh-vi');
    btn.classList.add('loading');
    btn.textContent = '⏳';

    if (!navigator.geolocation) {
        alert('Trình duyệt không hỗ trợ GPS');
        btn.classList.remove('loading');
        btn.textContent = '📍';
        return;
    }

    navigator.geolocation.getCurrentPosition(
        pos => {
            const { latitude: lat, longitude: lng } = pos.coords;

            mapBanDo.flyTo({ center: [lng, lat], zoom: 15, duration: 1500 });

            // Marker vị trí hiện tại (chấm xanh pulse)
            const el = document.createElement('div');
            el.style.cssText = `
                width: 16px; height: 16px;
                background: #378ADD;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 0 0 4px rgba(55,138,221,0.3);
            `;

            new mapboxgl.Marker({ element: el })
                .setLngLat([lng, lat])
                .setPopup(new mapboxgl.Popup({ offset: 10 })
                    .setHTML('<div style="padding:8px;font-size:13px;font-weight:600;font-family:\'Be Vietnam Pro\',sans-serif">📍 Vị trí của bạn</div>'))
                .addTo(mapBanDo);

            btn.classList.remove('loading');
            btn.textContent = '📍';
        },
        err => {
            console.warn(err);
            btn.classList.remove('loading');
            btn.textContent = '📍';
            alert('Không thể lấy vị trí. Hãy cho phép truy cập GPS trong trình duyệt.');
        },
        { timeout: 10000, enableHighAccuracy: true }
    );
}

// =============================================
// MAP CHỌN VỊ TRÍ (Tab báo cáo mới)
// =============================================
function khoiTaoMapChonViTri() {
    if (mapChonViTri) return;

    mapChonViTri = new mapboxgl.Map({
        container: 'map-chon-vi-tri',
        center: [105.8412, 21.0245],
        zoom: 13,
        style: 'mapbox://styles/mapbox/standard',
    });

    mapChonViTri.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Nếu đã có GPS thì bay đến vị trí người dùng
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            mapChonViTri.flyTo({
                center: [pos.coords.longitude, pos.coords.latitude],
                zoom: 15
            });
        });
    }

    // Click để chọn vị trí
    mapChonViTri.on('click', e => {
        const { lng, lat } = e.lngLat;
        viTriChon = { lat, lng };

        // Xóa marker cũ
        if (markerChon) markerChon.remove();

        // Tạo marker pin đỏ
        const el = document.createElement('div');
        el.style.cssText = `
            width: 28px; height: 28px;
            background: #E24B4A;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            border: 3px solid white;
            box-shadow: 0 3px 12px rgba(226,75,74,0.5);
        `;

        markerChon = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([lng, lat])
            .addTo(mapChonViTri);

        // Hiện tọa độ
        $('#vi-tri-hien-thi').html(
            `<div class="vi-tri-tag">📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}</div>`
        );
        $('#map-hint').addClass('hidden');

        // Geocode ngược → tự điền địa chỉ
        geocodeNguoc(lat, lng);
    });
}

function geocodeNguoc(lat, lng) {
    fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&language=vi&limit=1`)
        .then(r => r.json())
        .then(data => {
            if (data.features?.length) {
                $('#bc-dia-chi').val(data.features[0].place_name);
            }
        })
        .catch(() => { });
}

// =============================================
// GỬI BÁO CÁO
// =============================================
function guiBaoCao() {
    const token = localStorage.getItem('token');
    if (!token) { hienAlert('alert-bc', 'error', 'Vui lòng đăng nhập để gửi báo cáo'); return; }
    if (!viTriChon) { hienAlert('alert-bc', 'error', 'Vui lòng nhấn vào bản đồ để chọn vị trí'); return; }

    const loai = $('#bc-loai').val();
    const diaChi = $('#bc-dia-chi').val().trim();
    if (!loai) { hienAlert('alert-bc', 'error', 'Vui lòng chọn loại sự cố'); return; }
    if (!diaChi) { hienAlert('alert-bc', 'error', 'Vui lòng nhập địa chỉ'); return; }

    $('#btn-gui').prop('disabled', true).html('<span class="spinner"></span>Đang gửi...');

    $.ajax({
        url: `${API}/bao-cao`,
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: JSON.stringify({
            loai_su_co_id: parseInt(loai),
            tieu_de: $('#bc-loai option:selected').text(),
            dia_chi: diaChi,
            mo_ta: $('#bc-mo-ta').val().trim(),
            vi_do: viTriChon.lat,
            kinh_do: viTriChon.lng
        }),
        success: () => {
            hienAlert('alert-bc', 'success', '✅ Báo cáo đã gửi thành công!');
            resetFormBaoCao();
            taiDanhSach();
            taiBaoCaoCuaToi();
            setTimeout(() => doiTrang('cua-toi'), 1500);
        },
        error: xhr => hienAlert('alert-bc', 'error', xhr.responseJSON?.loi || 'Gửi thất bại, thử lại sau'),
        complete: () => $('#btn-gui').prop('disabled', false).text('Gửi báo cáo')
    });
}

function resetFormBaoCao() {
    $('#bc-loai').val('');
    $('#bc-dia-chi, #bc-mo-ta').val('');
    $('#bc-preview').hide();
    $('#vi-tri-hien-thi').html('<span class="vi-tri-placeholder">Chưa chọn — nhấn vào bản đồ phía trên</span>');
    $('#map-hint').removeClass('hidden');
    markerChon?.remove();
    markerChon = null;
    viTriChon = null;
}

function xemAnh(input) {
    if (input.files?.[0]) {
        const r = new FileReader();
        r.onload = e => {
            $('#bc-preview-img').attr('src', e.target.result);
            $('#bc-preview').show();
        };
        r.readAsDataURL(input.files[0]);
    }
}

// =============================================
// CỦA TÔI
// =============================================
function taiBaoCaoCuaToi() {
    const token = localStorage.getItem('token');
    const hoTen = localStorage.getItem('ho_ten') || 'tôi';
    $('#cua-toi-title').text(`Báo cáo của ${hoTen}`);

    if (!token) {
        $('#ds-cua-toi').html(`
            <div class="empty-state">
                <div class="empty-icon">🔒</div>
                <div class="empty-text">Chưa đăng nhập</div>
                <div class="empty-sub">Vui lòng đăng nhập để xem báo cáo</div>
            </div>`);
        return;
    }

    $('#ds-cua-toi').html('<div class="loading-text">Đang tải...</div>');

    $.ajax({
        url: `${API}/bao-cao/cua-toi`,
        headers: { 'Authorization': `Bearer ${token}` },
        success: res => {
            console.log('API /bao-cao/cua-toi trả về:', res); // ← xem cấu trúc thật

            // Thử các key có thể có
            const ds = res.bao_cao || res.data || res.result || (Array.isArray(res) ? res : []);
            renderCuaToi(ds);
        },
        error: (xhr) => {
            // Log lỗi thật ra console thay vì dùng demo
            console.error('Lỗi API:', xhr.status, xhr.responseJSON);

            const msg = xhr.responseJSON?.loi || `Lỗi ${xhr.status}`;
            $('#ds-cua-toi').html(`
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <div class="empty-text">Không thể tải báo cáo</div>
                    <div class="empty-sub">${msg}</div>
                </div>`);
        }
    });
}

function renderCuaToi(ds) {
    if (!ds.length) {
        $('#ds-cua-toi').html(`
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <div class="empty-text">Chưa có báo cáo nào</div>
                <div class="empty-sub">Nhấn "+ Báo cáo sự cố" để gửi báo cáo đầu tiên</div>
            </div>`);
        return;
    }
    $('#cua-toi-title').text(`Báo cáo của tôi (${ds.length})`);
    $('#ds-cua-toi').html(ds.map(item => renderBaoCaoCard(item)).join(''));
}

const STEPS = [
    { label: 'Gửi' }, { label: 'Duyệt' }, { label: 'Phân công' },
    { label: 'Xử lý' }, { label: 'Nghiệm thu' }, { label: 'Hoàn thành' },
];

const STATUS_INFO = {
    cho_duyet: { idx: 0, color: '#EF9F27', badge: 'badge-cho-duyet', label: 'Chờ duyệt' },
    da_duyet: { idx: 1, color: '#378ADD', badge: 'badge-da-duyet', label: 'Đã duyệt' },
    da_phan_cong: { idx: 2, color: '#7F77DD', badge: 'badge-dang-xu-ly', label: 'Đã phân công' },
    dang_xu_ly: { idx: 3, color: '#1D9E75', badge: 'badge-dang-xu-ly', label: 'Đang xử lý' },
    cho_nghiem_thu: { idx: 4, color: '#BA7517', badge: 'badge-dang-xu-ly', label: 'Chờ nghiệm thu' },
    da_xu_ly: { idx: 5, color: '#639922', badge: 'badge-da-xu-ly', label: 'Đã xử lý' },
    tu_choi: { idx: -1, color: '#E24B4A', badge: 'badge-tu-choi', label: 'Từ chối' },
};

function renderBaoCaoCard(item) {
    const tt = item.trang_thai || 'cho_duyet';
    const info = STATUS_INFO[tt] || STATUS_INFO['cho_duyet'];
    const meta = [escHtml(item.dia_chi || ''), item.ngay_tao ? tinhThoiGian(item.ngay_tao) : '']
        .filter(Boolean).join(' · ');
    return `
    <div class="bao-cao-card">
        <div class="card-header">
            <div class="card-ten">${escHtml(item.tieu_de || 'Sự cố')}</div>
            <span class="badge ${info.badge}">${info.label}</span>
        </div>
        <div class="card-meta">${meta}</div>
        ${tt === 'tu_choi' ? renderStepperTuChoi() : renderStepper(info)}
        ${tt === 'tu_choi' ? `<div class="tu-choi-note">Báo cáo bị từ chối. Vui lòng kiểm tra lại nội dung và gửi lại.</div>` : ''}
    </div>`;
}

function renderStepper(info) {
    const { idx: activeIdx, color } = info;
    return `<div class="stepper">
        ${STEPS.map((st, i) => {
        const done = i <= activeIdx;
        const current = i === activeIdx;
        const dotStyle = done
            ? `background:${color};border-color:${color};${current ? `box-shadow:0 0 0 3px ${color}33;` : ''}`
            : `background:var(--xam-nhat);border-color:var(--border);`;
        const txt = done && !current ? st.label + ' ✓' : current ? st.label + '...' : st.label;
        return `
            <div class="stepper-item">
                <div class="stepper-row">
                    <div class="stepper-line" style="background:${i === 0 ? 'transparent' : i <= activeIdx ? color : 'var(--border)'};"></div>
                    <div class="stepper-dot" style="${dotStyle}">
                        ${done && !current ? `<svg width="8" height="8" viewBox="0 0 8 8"><polyline points="1,4 3,6 7,2" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>` : ''}
                    </div>
                    <div class="stepper-line" style="background:${i === STEPS.length - 1 ? 'transparent' : i < activeIdx ? color : 'var(--border)'};"></div>
                </div>
                <div class="stepper-label" style="color:${done ? color : 'rgba(44,44,42,.35)'};font-weight:${done ? 600 : 400};">${txt}</div>
            </div>`;
    }).join('')}
    </div>`;
}

function renderStepperTuChoi() {
    const red = '#E24B4A';
    return `<div class="stepper">
        <div class="stepper-item">
            <div class="stepper-row">
                <div class="stepper-line" style="background:transparent;"></div>
                <div class="stepper-dot" style="background:#639922;border-color:#639922;">
                    <svg width="8" height="8" viewBox="0 0 8 8"><polyline points="1,4 3,6 7,2" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
                </div>
                <div class="stepper-line" style="background:${red};"></div>
            </div>
            <div class="stepper-label" style="color:#27500A;font-weight:600;">Gửi ✓</div>
        </div>
        <div class="stepper-item" style="flex:2;">
            <div class="stepper-row">
                <div class="stepper-line" style="background:${red};"></div>
                <div class="stepper-dot" style="background:${red};border-color:${red};">
                    <svg width="8" height="8" viewBox="0 0 8 8"><line x1="2" y1="2" x2="6" y2="6" stroke="white" stroke-width="1.5" stroke-linecap="round"/><line x1="6" y1="2" x2="2" y2="6" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>
                </div>
                <div class="stepper-line" style="background:var(--border);"></div>
            </div>
            <div class="stepper-label" style="color:${red};font-weight:600;">Từ chối ✗</div>
        </div>
        ${STEPS.slice(2).map(st => `
        <div class="stepper-item">
            <div class="stepper-row">
                <div class="stepper-line" style="background:var(--border);"></div>
                <div class="stepper-dot" style="background:var(--xam-nhat);border-color:var(--border);"></div>
                <div class="stepper-line" style="background:var(--border);"></div>
            </div>
            <div class="stepper-label" style="color:rgba(44,44,42,.35);font-weight:400;">${st.label}</div>
        </div>`).join('')}
    </div>`;
}

// =============================================
// CHUYỂN TRANG
// =============================================
function doiTrang(trang) {
    $('.nav-tab').removeClass('active');
    $(`.nav-tab:eq(${trang === 'ban-do' ? 0 : trang === 'bao-cao' ? 1 : 2})`).addClass('active');
    $('.page').removeClass('active');
    $(`#page-${trang}`).addClass('active');

    if (trang === 'bao-cao') {
        setTimeout(() => {
            khoiTaoMapChonViTri();
            mapChonViTri?.resize();
        }, 50);
    }

    if (trang === 'ban-do' && mapBanDo) {
        setTimeout(() => mapBanDo.resize(), 50);
    }
}

// =============================================
// DEMO DATA
// =============================================
function getDemoData() {
    return [
        { tieu_de: 'Ổ gà lớn', dia_chi: 'Nguyễn Trãi, Q.Thanh Xuân', trang_thai: 'da_duyet', ten_nguoi_gui: 'Nguyễn Văn A', ngay_tao: new Date(Date.now() - 7200000).toISOString(), vi_do: 21.0200, kinh_do: 105.8200, loai_su_co: 'Ổ gà', loai_su_co_id: 1 },
        { tieu_de: 'Ngập nước sau mưa', dia_chi: 'Hoàng Quốc Việt, Q.Cầu Giấy', trang_thai: 'dang_xu_ly', ten_nguoi_gui: 'Trần Thị B', ngay_tao: new Date(Date.now() - 18000000).toISOString(), vi_do: 21.0380, kinh_do: 105.7950, loai_su_co: 'Ngập nước', loai_su_co_id: 2 },
        { tieu_de: 'Đèn tín hiệu hỏng', dia_chi: 'Lê Văn Lương, Q.Đống Đa', trang_thai: 'cho_duyet', ten_nguoi_gui: 'Lê Minh C', ngay_tao: new Date(Date.now() - 86400000).toISOString(), vi_do: 21.0150, kinh_do: 105.8350, loai_su_co: 'Đèn hỏng', loai_su_co_id: 3 },
        { tieu_de: 'Tai nạn giao thông', dia_chi: 'Giải Phóng, Q.Hai Bà Trưng', trang_thai: 'da_xu_ly', ten_nguoi_gui: 'Phạm Thu D', ngay_tao: new Date(Date.now() - 172800000).toISOString(), vi_do: 21.0050, kinh_do: 105.8450, loai_su_co: 'Tai nạn', loai_su_co_id: 4 },
        { tieu_de: 'Vật cản lòng đường', dia_chi: 'Kim Mã, Q.Ba Đình', trang_thai: 'da_phan_cong', ten_nguoi_gui: 'Hoàng Văn E', ngay_tao: new Date(Date.now() - 3600000).toISOString(), vi_do: 21.0320, kinh_do: 105.8100, loai_su_co: 'Vật cản', loai_su_co_id: 5 },
    ];
}

function getDemoCuaToi() {
    return [
        { tieu_de: 'Ổ gà lớn', dia_chi: 'Nguyễn Trãi, Q.Thanh Xuân', trang_thai: 'dang_xu_ly', ngay_tao: new Date(Date.now() - 7200000).toISOString() },
        { tieu_de: 'Đèn tín hiệu hỏng', dia_chi: 'Lê Văn Lương, Q.Đống Đa', trang_thai: 'cho_duyet', ngay_tao: new Date(Date.now() - 86400000).toISOString() },
        { tieu_de: 'Ngập nước', dia_chi: 'Hoàng Quốc Việt, Q.Cầu Giấy', trang_thai: 'da_xu_ly', ngay_tao: new Date(Date.now() - 432000000).toISOString() },
    ];
}
