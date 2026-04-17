/* =============================================
   UTILS.JS — Hàm dùng chung toàn project
   ============================================= */

const API = 'http://127.0.0.1:5000';

// Thêm dòng này ở đầu file (sau dòng const API = ...)
const DANG_NHAP_URL = '../dang_nhap/dang_nhap.html';

function getHeaders() {
    return {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
    };
}


function requireLogin() {
    const token = localStorage.getItem('token');
    const dangODangNhap = window.location.pathname.includes('dang_nhap');

    if (!token && !dangODangNhap) {
        window.location.replace(DANG_NHAP_URL);  // ← sửa chỗ này
        return false;
    }
    return true;
}

// ✅ Thêm hàm mới — check cả token lẫn vai trò
function requireRole(vaiTroYeuCau) {
    const token  = localStorage.getItem('token');
    const vaiTro = localStorage.getItem('vai_tro');

    if (!token) {
        window.location.replace(DANG_NHAP_URL);
        return false;
    }

    if (vaiTro !== vaiTroYeuCau) {
        // Có token nhưng sai vai trò → redirect về trang đúng vai trò
        if (vaiTro === 'admin')       window.location.replace('../admin/index.html');
        else if (vaiTro === 'nhan_vien') window.location.replace('../dang_nhap/.html');
        else                          window.location.replace('../ban_do/index.html');
        return false;
    }

    return true;
}

function dangXuat() {
    localStorage.clear();
    window.location.replace(DANG_NHAP_URL);  // ← sửa chỗ này
}

function toggleDropdown() {
    $('#nav-dropdown').toggleClass('show');
}

function khoiTaoNavbarUser() {
    const hoTen   = localStorage.getItem('ho_ten') || 'Người dùng';
    const vietTat = hoTen.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    $('#nav-avatar').contents().first().replaceWith(vietTat);
    $('#dd-ten').text('👤 ' + hoTen);
    $(document).on('click', e => {
        if (!$(e.target).closest('.nav-avatar').length) $('#nav-dropdown').removeClass('show');
    });
}

function renderBadge(tt) {
    const map = {
        cho_duyet:      ['badge-cho-duyet',  'Chờ duyệt'],
        da_duyet:       ['badge-da-duyet',   'Đã xác nhận'],
        da_phan_cong:   ['badge-dang-xu-ly', 'Đã phân công'],
        dang_xu_ly:     ['badge-dang-xu-ly', 'Đang xử lý'],
        cho_nghiem_thu: ['badge-dang-xu-ly', 'Chờ nghiệm thu'],
        da_xu_ly:       ['badge-da-xu-ly',   'Đã xử lý'],
        tu_choi:        ['badge-tu-choi',    'Từ chối'],
    };
    const [cls, label] = map[tt] || ['badge-cho-duyet', tt || '?'];
    return `<span class="badge ${cls}">${label}</span>`;
}

function getProgressInfo(tt) {
    // Trường hợp đặc biệt: bị từ chối
    if (tt === 'tu_choi') {
        return {
            fillClass: 'fill-tu-choi',
            labels: [
                { text: 'Gửi ✓',    cls: 'done'    },
                { text: 'Từ chối ✗', cls: 'tu-choi' },
                { text: 'Xử lý',    cls: ''         },
                { text: 'Xong',     cls: ''         },
            ]
        };
    }

    const map = {
        cho_duyet:      { fill: 'fill-cho',   idx: 0 },
        da_duyet:       { fill: 'fill-duyet', idx: 1 },
        da_phan_cong:   { fill: 'fill-duyet', idx: 1 },
        dang_xu_ly:     { fill: 'fill-xu-ly', idx: 2 },
        cho_nghiem_thu: { fill: 'fill-xu-ly', idx: 2 },
        da_xu_ly:       { fill: 'fill-xong',  idx: 3 },
    };
    const { fill, idx } = map[tt] || { fill: 'fill-cho', idx: 0 };
    return {
        fillClass: fill,
        labels: [
            { text: 'Gửi ✓',                               cls: 'done'                          },
            { text: idx >= 1 ? 'Duyệt ✓' : 'Chờ duyệt...', cls: idx >= 1 ? 'done' : 'wait'    },
            { text: idx >= 2 ? 'Xử lý ✓' : 'Xử lý',        cls: idx >= 2 ? 'done' : idx === 1 ? 'active' : '' },
            { text: idx >= 3 ? 'Xong ✓'  : 'Xong',          cls: idx >= 3 ? 'done' : ''        },
        ]
    };
}

function mauTheoLoai(loai) {
    const l = (loai || '').toLowerCase();
    if (l.includes('gà')   || l.includes('đường'))  return '#E24B4A';
    if (l.includes('ngập') || l.includes('nước'))   return '#378ADD';
    if (l.includes('đèn'))                           return '#EF9F27';
    if (l.includes('tai nạn'))                       return '#A32D2D';
    if (l.includes('vật cản'))                       return '#7F77DD';
    return '#888780';
}

function tinhThoiGian(t) {
    if (!t) return '';
    const d = Math.floor((Date.now() - new Date(t)) / 60000);
    if (d < 60)   return `${d} phút trước`;
    if (d < 1440) return `${Math.floor(d / 60)} giờ trước`;
    return `${Math.floor(d / 1440)} ngày trước`;
}

function escHtml(s) {
    return String(s || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function hienAlert(id, loai, msg) {
    $(`#${id}`).attr('class', `alert-bc ${loai}`).text(msg).show();
    if (loai === 'success') setTimeout(() => $(`#${id}`).fadeOut(), 3000);
}
