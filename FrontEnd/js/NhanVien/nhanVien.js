// ============================================================
//  nhanVien.js  –  Workflow nhân viên xử lý sự cố
//  Bước 1: Nhận / Từ chối (da_phan_cong)
//  Bước 2: Đang làm       (dang_xu_ly)
//  Bước 3: Báo hoàn thành (upload ảnh + ghi chú)
//  Bước 4: Chờ nghiệm thu (cho_nghiem_thu) – chỉ xem
//  Bước 5: Hoàn thành     – sang tab Đã hoàn thành
// ============================================================

const API_BASE = window.API_BASE || 'http://127.0.0.1:5000';

// ============ STATE ============
let currentTaskId = null;   // ID task đang thao tác trong modal
let taskMap = {};            // cache toàn bộ task { bao_cao_id: taskObject }
let completionFiles = [];
let currentTaskLocation = null;

// ============ AUTH HELPER ============
function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

// Khi trở lại trang từ bfcache (bấm nút back), reload dữ liệu
window.addEventListener('pageshow', function (e) {
    if (e.persisted) fetchTasks();
});

// ============ INIT ============
$(document).ready(function () {
    // --- Kiểm tra đăng nhập và quyền nhân viên ---
    const _token = localStorage.getItem('token');
    const _vaiTro = localStorage.getItem('vai_tro');
    if (!_token || _vaiTro !== 'nhan_vien') {
        window.location.href = '../dang_nhap/dang_nhap.html';
        return;
    }

    // --- Load dữ liệu ban đầu ---
    fetchTasks();
    batDauPollingNhanVien();

    // --- Hiển thị tên nhân viên ---
    const name = localStorage.getItem("ho_ten") || localStorage.getItem("user_name");
    if (name) $('#admin-menu-btn').text(`${name} ▾`);

    // --- User dropdown ---
    $('#admin-menu-btn').click(function (e) {
        e.stopPropagation();
        $('#admin-dropdown').toggleClass('show');
    });

    // --- Mobile menu ---
    $('#sidebar-toggle-btn').click(function (e) {
        e.preventDefault();
        e.stopPropagation();
        $('body').toggleClass('sidebar-open');
    });

    $('#sidebar-backdrop').click(function () {
        $('body').removeClass('sidebar-open');
    });

    $('.modal-overlay').on('click', function (e) {
        if (e.target === this) {
            closeModal(this.id);
        }
    });

    // --- Sidebar navigation ---
    $('.menu-item').click(function () {
        $('.menu-item').removeClass('active');
        $(this).addClass('active');
        $('.page').removeClass('active');

        const page = $(this).data('page');
        $(`#page-${page}`).addClass('active');

        if (page === 'viec-cua-toi')  fetchTasks();
        if (page === 'da-hoan-thanh') loadDoneTasks();
        if (page === 'lich-su')       loadHistory();

        $('body').removeClass('sidebar-open');
    });

    // --- Profile ---
    $('#btn-profile').click(function (e) {
        e.preventDefault();
        window.location.href = 'profileNV.html';
    });

    $('#btn-open-map').click(function (e) {
        e.preventDefault();
        window.location.href = '../user/ban_do2.html?source=nhan_vien';
    });

    // --- Logout ---
    $('#logout-btn').click(async function (e) {
        e.preventDefault();
        $('#admin-dropdown').removeClass('show');
        await window.confirmLogout({
            badge: 'Đang xuất',
            title: 'Xác nhận đăng xuất',
            message: 'Bạn sẽ cần đăng nhập lại để tiếp tục sử dụng hệ thống. Bạn có chắc chắn muốn đăng xuất không?',
            confirmText: 'Đăng xuất'
        });
    });

    $(document).click(function (e) {
        if (!$(e.target).closest('.admin-dropdown-container').length) {
            $('#admin-dropdown').removeClass('show');
        }

        if ($('body').hasClass('sidebar-open') && !$(e.target).closest('.sidebar, #sidebar-toggle-btn').length) {
            $('body').removeClass('sidebar-open');
        }
    });

    $(window).on('resize', function () {
        if (window.innerWidth > 992) {
            $('body').removeClass('sidebar-open');
        }
    });

    // --- Filter: Đã hoàn thành ---
    $('#filter-month-done').on('change', loadDoneTasks);

    $('#upload-after').on('change', handleCompletionFileSelection);
    $(document).on('click', '.upload-preview-remove', function () {
        removeCompletionFile(Number($(this).data('index')));
    });

    // --- Filter: Lịch sử ---
    $('#search-history, #filter-status, #filter-month-history')
        .on('input change', loadHistory);

    // ================================================================
    //  MODAL NHẬN VIỆC – các nút bên trong
    // ================================================================

    // Nút "Nhận việc" trong modal chi tiết
    $('#btn-confirm-nhan').off('click').on('click', function () {
        if (!currentTaskId) return;
        apiNhanViec(currentTaskId);
    });

    // Nút "Từ chối" trong modal chi tiết
    $('#btn-tu-choi').off('click').on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!currentTaskId) return;
        apiTuChoi(currentTaskId, function () {
            closeModal('modal-nhan-viec');
        });
    });

    // Nút "Báo hoàn thành" trong modal chi tiết (dang_xu_ly)
    $('#btn-open-hoan-thanh').off('click').on('click', function () {
        if (!currentTaskId) return;
        closeModal('modal-nhan-viec');
        setTimeout(function () {
            openModalHoanThanh(currentTaskId);
        }, 120);
    });

    // ================================================================
    //  MODAL HOÀN THÀNH – gửi form
    // ================================================================
    $('#btn-confirm-hoan').off('click').on('click', function (e) {
        e.preventDefault();

        if (!currentTaskId) {
            showToast("Không xác định công việc", true);
            return;
        }

        if (!completionFiles.length) {
            showToast("Phải upload ít nhất 1 ảnh sau sửa chữa", true);
            return;
        }

        const btn = $(this);
        btn.prop('disabled', true).text('Đang gửi...');

        apiHoanThanh(currentTaskId, function () {
            btn.prop('disabled', false).text('Gửi');
        }, function () {
            btn.prop('disabled', false).text('Gửi');
        });
    });

    // ================================================================
    //  DELEGATE – nút "Báo hoàn thành" trên task card (dang_xu_ly)
    // ================================================================
    $(document).on('click', '.btn-hoan-thanh', function (e) {
        e.stopPropagation();
        const id = $(this).closest('.task-card').data('id');
        if (!id) { showToast("Không lấy được ID", true); return; }
        openModalHoanThanh(id);
    });

    // ================================================================
    //  DELEGATE – nút "Nhận" trực tiếp trên task card (da_phan_cong)
    // ================================================================
    $(document).on('click', '.btn-nhan-viec', function (e) {
        e.stopPropagation();
        const id = $(this).closest('.task-card').data('id');
        if (!id) return;
        apiNhanViec(id);
    });

    // ================================================================
    //  DELEGATE – nút "Từ chối" trực tiếp trên task card
    // ================================================================
    $(document).on('click', '.btn-tu-choi-card', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const id = $(this).closest('.task-card').data('id');
        if (!id) return;
        apiTuChoi(id);
    });

    // Mở modal chi tiết khi bấm vào card, nhưng bỏ qua các nút thao tác bên trong.
    $(document).on('click', '.task-card', function (e) {
        if ($(e.target).closest('.card-actions, button').length) return;
        const id = $(this).data('id');
        if (!id) return;
        openTaskDetail(id);
    });

    $(document).on('click', '.report-image-thumb', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const src = $(this).data('src') || $(this).attr('src');
        if (!src) return;
        openImageViewer(src);
    });

    $(document).on('click', '.btn-view-report', function (e) {
        e.preventDefault();
        e.stopPropagation();

        const id = $(this).data('id');
        if (!id) return;

        openEmployeeReportDetail(id);
    });

    $('#btn-chi-duong').off('click').on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openDirectionsForCurrentTask();
    });
});


// ============================================================
//  API CALLS
// ============================================================

/** Lấy danh sách việc hiện tại của nhân viên */
function fetchTasks() {
    $.ajax({
        url: `${API_BASE}/nhan-vien/viec-cua-toi`,
        method: "GET",
        headers: authHeader(),
        success: function (data) {
            renderTasks(data);   // đúng format backend
        },
        error: function (xhr) {
            closeModal('modal-nhan-viec');
            showToast(xhr.responseJSON?.loi || "Lỗi tải dữ liệu", true);
        }
    });
}

/**
 * Bước 1 – Nhận việc
 * Trạng thái: da_phan_cong → dang_xu_ly
 */
async function apiNhanViec(id) {
    const result = await openEmployeeActionModal({
        type: 'success',
        badge: 'Nhận công việc',
        title: 'Xác nhận nhận việc',
        message: 'Công việc này sẽ được chuyển sang trạng thái đang xử lý và ghi nhận là bạn đã nhận việc.',
        confirmText: 'Xác nhận nhận'
    });
    if (!result.confirmed) return;

    $.ajax({
        url: `${API_BASE}/nhan-vien/bao-cao/${id}/nhan-viec`,
        method: "PUT",
        headers: authHeader(),
        success: function () {
            showToast("Nhận việc thành công!");
            closeModal('modal-nhan-viec');
            fetchTasks();
        },
        error: function (xhr) {
            showToast(xhr.responseJSON?.loi || "Lỗi khi nhận việc", true);
        }
    });
}

/**
 * Bước 1 – Từ chối việc
 * Trạng thái: da_phan_cong → quay về hệ thống
 */
async function apiTuChoi(id, callback) {
    const result = await openEmployeeActionModal({
        type: 'danger',
        badge: 'Từ chối công việc',
        title: 'Xác nhận từ chối nhận việc',
        message: 'Công việc này sẽ được trả lại hệ thống để admin phân công lại cho nhân viên khác.',
        requireReason: true,
        minLength: 3,
        label: 'Lý do từ chối',
        hint: 'Nêu rõ nguyên nhân để admin biết vì sao bạn không thể nhận việc này.',
        placeholder: 'Ví dụ: Khu vực xử lý ngoài phạm vi phụ trách hoặc đang thiếu thiết bị.',
        confirmText: 'Xác nhận từ chối',
        cancelText: 'Hủy'
    });
    if (!result.confirmed) return;

    $.ajax({
        url: `${API_BASE}/nhan-vien/bao-cao/${id}/tu-choi`,
        method: "PUT",
        headers: authHeader(),
        contentType: 'application/json',
        data: JSON.stringify({ ghi_chu: result.value }),
        success: function () {
            showToast("Đã từ chối, việc trả về hệ thống.");
            fetchTasks();
            if (typeof callback === "function") callback();
        },
        error: function (xhr) {
            showToast(xhr.responseJSON?.loi || "Lỗi khi từ chối", true);
        }
    });
}

/**
 * Bước 3 – Báo hoàn thành
 * Upload ảnh (bắt buộc) + ghi chú
 * Trạng thái: dang_xu_ly → cho_nghiem_thu
 */
async function apiHoanThanh(id, onSuccess, onError) {
    const result = await openEmployeeActionModal({
        type: 'success',
        badge: 'Gửi nghiệm thu',
        title: 'Xác nhận gửi nghiệm thu',
        message: 'Báo cáo xử lý này sẽ được gửi cho admin để nghiệm thu kết quả.',
        confirmText: 'Xác nhận gửi'
    });
    if (!result.confirmed) {
        if (typeof onError === "function") onError();
        return;
    }

    const formData = new FormData();
    formData.append("ghi_chu", $('#note-hoan-thanh').val() || "");

    completionFiles.forEach(function (item) {
        formData.append("images", item.file);
    });

    $.ajax({
        url: `${API_BASE}/nhan-vien/bao-cao/${id}/hoan-thanh`,
        method: "POST",
        headers: authHeader(),
        data: formData,
        processData: false,
        contentType: false,

        success: function () {
            showToast("Đã gửi nghiệm thu! Chờ admin duyệt.");
            closeModal('modal-hoan-thanh');
            resetFormHoanThanh();
            fetchTasks();

            if (typeof onSuccess === "function") onSuccess();
        },

        error: function (xhr) {
            const msg = xhr.responseJSON?.loi || "Lỗi server";

            // 🔥 HIỂN THỊ LỖI TRONG MODAL (không phải toast)
            $('#error-hoan-thanh')
                .text(msg)
                .show();

            if (typeof onError === "function") onError();
        }
    });
}

/** Lấy danh sách đã hoàn thành (tab Đã hoàn thành) */
function loadDoneTasks() {
    const month = $('#filter-month-done').val();
    $.ajax({
        url: `${API_BASE}/nhan-vien/da-hoan-thanh`,
        method: "GET",
        headers: authHeader(),
        data: { month },
        success: function (data) {
            const tbody = $('#done-table-body').empty();
            if (!data.length) {
                tbody.append('<tr><td colspan="6" style="text-align:center;color:#999">Chưa có dữ liệu</td></tr>');
                return;
            }
            data.forEach(item => {
                tbody.append(`
                    <tr>
                        <td>${item.bao_cao_id}</td>
                        <td>${escapeHtml(item.tieu_de)}</td>
                        <td>${escapeHtml(item.loai_su_co)}</td>
                        <td>${formatDateTime(item.ngay_xong) || '—'}</td>
                        <td><span class="badge badge-done">Hoàn thành</span></td>
                        <td><button type="button" class="btn btn-secondary-light btn-view-report" data-id="${item.bao_cao_id}">Xem</button></td>
                    </tr>
                `);
            });
        },
        error: function () {
            showToast("Lỗi tải danh sách hoàn thành", true);
        }
    });
}

/** Lấy lịch sử thay đổi trạng thái (tab Lịch sử) */
function loadHistory() {
    const search = $('#search-history').val();
    const status = $('#filter-status').val();
    const month  = $('#filter-month-history').val();

    $.ajax({
        url: `${API_BASE}/nhan-vien/lich-su`,
        method: "GET",
        headers: authHeader(),
        data: { search, status, month },
        success: function (data) {
            const tbody = $('#history-table-body').empty();
            if (!data.length) {
                tbody.append('<tr><td colspan="7" style="text-align:center;color:#999">Không có lịch sử</td></tr>');
                return;
            }
            data.forEach(item => {
                tbody.append(`
                    <tr>
                        <td>${item.bao_cao_id}</td>
                        <td>${escapeHtml(item.tieu_de)}</td>
                        <td>${escapeHtml(item.loai_su_co)}</td>
                        <td>${formatDateTime(item.ngay_doi) || '—'}</td>
                        <td>${formatTrangThai(item.trang_thai_moi)}</td>
                        <td>${escapeHtml(item.ghi_chu || '—')}</td>
                        <td><button type="button" class="btn btn-secondary-light btn-view-report" data-id="${item.bao_cao_id}">Xem</button></td>
                    </tr>
                `);
            });
        },
        error: function () {
            showToast("Lỗi tải lịch sử", true);
        }
    });
}


// ============================================================
//  RENDER
// ============================================================

function renderTasks(tasks) {
    taskMap = {};

    const $chuaNhan = $('#list-chua-nhan').empty();
    const $dangLam  = $('#list-dang-lam').empty();
    const $daXong   = $('#list-da-xong').empty();

    let countChuaNhan = 0, countDangLam = 0, countDaXong = 0;

    tasks.forEach(task => {
        taskMap[task.bao_cao_id] = task;
        const id = task.bao_cao_id;

        // ----- Tạo nút action theo trạng thái (Bước 1 & 2) -----
        let actions = "";

        if (task.trang_thai === 'da_phan_cong') {
            // Bước 1: Nhận hoặc Từ chối
            actions = `
                <div class="card-actions">
                    <button class="btn btn-primary btn-nhan-viec">Nhận</button>
                    <button class="btn btn-tu-choi-card">Từ chối</button>
                </div>`;
        } else if (task.trang_thai === 'dang_xu_ly') {
            // Bước 2: Báo hoàn thành
            actions = `
                <div class="card-actions">
                    <button class="btn btn-primary btn-hoan-thanh">Báo hoàn thành</button>
                </div>`;
        } else if (task.trang_thai === 'cho_nghiem_thu') {
            // Bước 4: Chờ nghiệm thu – không có nút thao tác
            actions = `<div class="card-actions"><span class="badge badge-waiting">Chờ nghiệm thu</span></div>`;
        }

        const html = `
            <div class="task-card" data-id="${id}">
                <div class="task-card__head">
                    <h4 class="task-title">${task.tieu_de}</h4>
                    <span class="task-card__id">#${id}</span>
                </div>
                <div class="task-meta">
                    <span class="task-meta__icon">●</span>
                    <span>${task.dia_chi || 'Chưa có địa chỉ'}</span>
                </div>
                <div class="task-meta">
                    <span class="task-meta__icon">●</span>
                    <span>${task.loai_su_co || 'Chưa phân loại'}</span>
                </div>
                ${actions}
            </div>`;

        if (task.trang_thai === 'da_phan_cong')   { $chuaNhan.append(html); countChuaNhan++; }
        else if (task.trang_thai === 'dang_xu_ly') { $dangLam.append(html);  countDangLam++;  }
        else if (task.trang_thai === 'cho_nghiem_thu') { $daXong.append(html); countDaXong++;  }
    });

    // Ẩn/hiện section
    toggleSection('#section-chua-nhan', countChuaNhan);
    toggleSection('#section-dang-lam',  countDangLam);
    toggleSection('#section-da-xong',   countDaXong);

    // Cập nhật stats dashboard
    $('#stat-moi').text(countChuaNhan);
    $('#stat-dang').text(countDangLam);
    $('#stat-done').text(countDaXong);

    // Đếm trên sidebar (chưa nhận + đang làm)
    $('#menu-count').text(countChuaNhan + countDangLam);
}

function toggleSection(selector, count) {
    const $section = $(selector);
    const $list = $section.find('.task-list');

    $section.show();

    if (count === 0) {
        const emptyLabel = $section.find('.section-header h3').text() || 'danh sách';
        $list.html(`<div class="empty-state">Không có công việc trong mục ${emptyLabel.toLowerCase()}.</div>`);
    }
}


// ============================================================
//  MODAL CHI TIẾT TASK
// ============================================================

/**
 * Mở modal chi tiết, hiển thị đúng nút theo trạng thái:
 *  da_phan_cong  → Nhận + Từ chối
 *  dang_xu_ly    → Báo hoàn thành
 *  cho_nghiem_thu → không có nút (Bước 4)
 */
function openTaskDetail(id) {
    const task = taskMap[id];
    if (!task) return;

    currentTaskId = task.bao_cao_id;

    // Điền thông tin
    $('#mn-title').text(task.tieu_de);
    $('#mn-addr').text(task.dia_chi);
    $('#mn-type').text(task.loai_su_co);
    $('#mn-time').text(formatDateTime(task.ngay_tao) || '—');
    $('#mn-attempt').text(task.lan_thu || 1);
    $('#mn-mota').text(task.mo_ta || '—');
    $('#mn-images').html('<div class="report-image-empty">Đang tải ảnh hiện trạng...</div>');
    $('#mn-completion-images').html('<div class="report-image-empty">Đang tải ảnh sau xử lý...</div>');
    currentTaskLocation = getTaskCoordinates(task);
    updateDirectionsButtonState();

    // Reset tất cả nút trước
    $('#btn-confirm-nhan, #btn-tu-choi, #btn-open-hoan-thanh').hide();

    switch (task.trang_thai) {
        case 'da_phan_cong':
            // Bước 1
            $('#btn-confirm-nhan').show();
            $('#btn-tu-choi').show();
            break;

        case 'dang_xu_ly':
            // Bước 2 → mở modal hoàn thành
            $('#btn-open-hoan-thanh').show();
            break;

        case 'cho_nghiem_thu':
            // Bước 4: chỉ xem, không thao tác
            break;
    }

    openModal('modal-nhan-viec');
    document.querySelector('#modal-nhan-viec .modal')?.scrollTo(0, 0);
    loadTaskImages(task.bao_cao_id);
}


// ============================================================
//  MODAL HOÀN THÀNH (Bước 3)
// ============================================================

function openModalHoanThanh(id) {
    currentTaskId = id;

    closeModal('modal-nhan-viec');

    resetFormHoanThanh();

    $('#error-hoan-thanh').hide().text(""); // ✅ chuẩn

    $('#btn-confirm-hoan').prop('disabled', false).text('Gửi');

    openModal('modal-hoan-thanh');
}

function resetFormHoanThanh() {
    $('#note-hoan-thanh').val('');
    $('#upload-after').val('');
    completionFiles.forEach(function (item) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    completionFiles = [];
    renderCompletionPreview();
}


// ============================================================
//  HELPERS
// ============================================================

function formatTrangThai(status) {
    const map = {
        'da_phan_cong':    'Được giao',
        'dang_xu_ly':      'Đang xử lý',
        'cho_nghiem_thu':  'Hoàn thành',
        'hoan_thanh':      'Hoàn thành',
        'tu_choi':         'Đã từ chối',
        'da_xu_ly':        'Đã xử lý',
        'da_duyet':        'Chờ phân công lại',
    };
    return map[status] || status;
}

function formatDateTime(value) {
    if (!value) return '';

    let date = null;

    if (value instanceof Date) {
        date = value;
    } else if (typeof value === 'string') {
        const raw = value.trim();
        const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);

        if (match) {
            date = new Date(
                Number(match[1]),
                Number(match[2]) - 1,
                Number(match[3]),
                Number(match[4] || 0),
                Number(match[5] || 0),
                Number(match[6] || 0)
            );
        } else if (/GMT$/i.test(raw) || /^[A-Za-z]{3},\s/.test(raw)) {
            const parsed = new Date(raw);
            if (!Number.isNaN(parsed.getTime())) {
                date = new Date(
                    parsed.getUTCFullYear(),
                    parsed.getUTCMonth(),
                    parsed.getUTCDate(),
                    parsed.getUTCHours(),
                    parsed.getUTCMinutes(),
                    parsed.getUTCSeconds()
                );
            } else {
                date = parsed;
            }
        } else {
            date = new Date(raw);
        }
    } else {
        date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showToast(msg, isError = false) {
    ensureEmployeeUi();

    const type = isError ? 'error' : 'success';
    const title = isError ? 'Thao tác không thành công' : 'Thành công';
    const duration = isError ? 4200 : 3200;
    const toastId = 'nv-toast-' + Date.now() + '-' + Math.random().toString(16).slice(2, 8);
    const icon = type === 'success' ? '✓' : '!';
    const $toast = $(
        '<div class="admin-toast admin-toast--' + type + '" id="' + toastId + '">' +
            '<div class="admin-toast__icon">' + icon + '</div>' +
            '<div class="admin-toast__body">' +
                '<div class="admin-toast__title"></div>' +
                '<div class="admin-toast__message"></div>' +
            '</div>' +
            '<button type="button" class="admin-toast__close" aria-label="Đóng">&times;</button>' +
        '</div>'
    );

    $toast.find('.admin-toast__title').text(title);
    $toast.find('.admin-toast__message').text(msg);
    $('#admin-toast-root').append($toast);

    requestAnimationFrame(function() {
        $toast.addClass('is-visible');
    });

    const removeToast = function() {
        $toast.removeClass('is-visible');
        setTimeout(function() { $toast.remove(); }, 180);
    };

    $toast.find('.admin-toast__close').on('click', removeToast);
    setTimeout(removeToast, duration);
}

function ensureEmployeeUi() {
    if ($('#admin-toast-root').length === 0) {
        $(document.body).append('<div id="admin-toast-root" class="admin-toast-root" aria-live="polite" aria-atomic="true"></div>');
    }

    if ($('#employee-action-modal').length === 0) {
        $(document.body).append(
            '<div id="employee-action-modal" class="admin-modal" style="display:none;" aria-hidden="true">' +
                '<div class="admin-modal__overlay"></div>' +
                '<div class="admin-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="employee-modal-title">' +
                    '<button type="button" class="admin-modal__close" id="employee-modal-close" aria-label="Đóng">&times;</button>' +
                    '<div class="admin-modal__badge" id="employee-modal-badge"></div>' +
                    '<h3 class="admin-modal__title" id="employee-modal-title"></h3>' +
                    '<p class="admin-modal__message" id="employee-modal-message"></p>' +
                    '<div id="employee-modal-reason-wrap" style="display:none; margin-top:16px;">' +
                        '<label for="employee-modal-reason" id="employee-modal-reason-label" style="display:block; margin-bottom:8px; font-size:12px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#6d8f8a;"></label>' +
                        '<textarea id="employee-modal-reason" rows="4" style="width:100%; border:1px solid #d5e6e2; border-radius:12px; padding:12px 14px; font-size:14px; color:#1f4f4a; background:#fff; resize:vertical;"></textarea>' +
                        '<div id="employee-modal-reason-hint" style="margin-top:8px; font-size:13px; color:#6d8f8a;"></div>' +
                        '<div id="employee-modal-reason-error" style="display:none; margin-top:8px; font-size:13px; color:#be123c;"></div>' +
                    '</div>' +
                    '<div class="admin-modal__actions">' +
                        '<button type="button" class="btn-action btn-secondary" id="employee-modal-cancel">Hủy</button>' +
                        '<button type="button" class="btn-action primary" id="employee-modal-confirm">Xác nhận</button>' +
                    '</div>' +
                '</div>' +
            '</div>'
        );
    }

    if ($('#employee-report-detail-modal').length === 0) {
        $(document.body).append(
            '<div id="employee-report-detail-modal" class="admin-modal" style="display:none;" aria-hidden="true">' +
                '<div class="admin-modal__overlay"></div>' +
                '<div class="admin-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="employee-report-title" style="max-width:min(960px, calc(100vw - 32px)); max-height:90vh; overflow-y:auto; padding:24px;">' +
                    '<button type="button" class="admin-modal__close" id="employee-report-close" aria-label="Đóng">&times;</button>' +
                    '<div style="margin-bottom:10px;color:#888;font-size:13px;">Chi tiết báo cáo &rsaquo; <strong id="employee-report-id"></strong></div>' +
                    '<h2 id="employee-report-title" style="margin-top:0;color:#333;"></h2>' +
                    '<p id="employee-report-address" style="color:#666;font-size:14px;margin-bottom:20px;"></p>' +
                    '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:20px;margin-bottom:24px;">' +
                        '<div style="background:#f9f9f9;padding:15px;border-radius:8px;">' +
                            '<h4 style="margin:0 0 10px 0;color:#555;">THÔNG TIN CHUNG</h4>' +
                            '<p><strong>Loại sự cố:</strong> <span id="employee-report-type"></span></p>' +
                            '<p><strong>Người báo cáo:</strong> <span id="employee-report-reporter"></span></p>' +
                            '<p><strong>Nhân viên xử lý:</strong> <span id="employee-report-staff"></span></p>' +
                            '<p><strong>Trạng thái:</strong> <span id="employee-report-status" class="badge"></span></p>' +
                        '</div>' +
                        '<div style="background:#f9f9f9;padding:15px;border-radius:8px;">' +
                            '<h4 style="margin:0 0 10px 0;color:#555;">MÔ TẢ NỘI DUNG</h4>' +
                            '<div id="employee-report-description" style="font-size:14px;line-height:1.5;color:#444;"></div>' +
                        '</div>' +
                    '</div>' +
                    '<div style="display:flex;justify-content:flex-end;margin:-4px 0 20px;">' +
                        '<button type="button" id="employee-report-directions" class="btn btn-primary">Chỉ đường</button>' +
                    '</div>' +
                    '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:20px;">' +
                        '<div class="image-section">' +
                            '<h4 style="border-left:4px solid #007bff;padding-left:10px;color:#007bff;">ẢNH HIỆN TRƯỜNG</h4>' +
                            '<div id="employee-report-original-images" class="report-image-grid" style="min-height:100px;background:#fcfcfc;border:1px dashed #ddd;border-radius:8px;padding:10px;"></div>' +
                        '</div>' +
                        '<div class="image-section">' +
                            '<h4 style="border-left:4px solid #28a745;padding-left:10px;color:#28a745;">ẢNH HOÀN THÀNH</h4>' +
                            '<div id="employee-report-completion-images" class="report-image-grid" style="min-height:100px;background:#fcfcfc;border:1px dashed #ddd;border-radius:8px;padding:10px;"></div>' +
                        '</div>' +
                    '</div>' +
                    '<hr style="border:none;border-top:1px solid #eee;margin:25px 0;">' +
                    '<h4 style="color:#555;">LỊCH SỬ TRẠNG THÁI</h4>' +
                    '<div id="employee-report-timeline"></div>' +
                '</div>' +
            '</div>'
        );
    }
}

function openEmployeeActionModal(options) {
    ensureEmployeeUi();
    options = options || {};

    const type = options.type || 'info';
    const confirmText = options.confirmText || 'Xác nhận';
    const cancelText = options.cancelText || 'Hủy';
    const $modal = $('#employee-action-modal');
    const $confirm = $('#employee-modal-confirm');
    const requireReason = !!options.requireReason;
    const minLength = Number(options.minLength || 0);
    const $reasonWrap = $('#employee-modal-reason-wrap');
    const $reasonInput = $('#employee-modal-reason');
    const $reasonError = $('#employee-modal-reason-error');

    $('#employee-modal-title').text(options.title || '');
    $('#employee-modal-message').text(options.message || '');
    $('#employee-modal-badge')
        .attr('class', 'admin-modal__badge admin-modal__badge--' + type)
        .text(options.badge || '');
    $('#employee-modal-cancel').text(cancelText);
    $confirm.text(confirmText).attr('class', 'btn-action ' + (type === 'danger' ? 'danger' : 'primary'));
    $('#employee-modal-reason-label').text(options.label || 'Lý do');
    $('#employee-modal-reason-hint').text(options.hint || '');
    $reasonInput.val(options.value || '').attr('placeholder', options.placeholder || '');
    $reasonError.hide().text('');
    $reasonWrap.toggle(requireReason);

    $modal.stop(true, true).fadeIn(150).attr('aria-hidden', 'false');

    return new Promise(function(resolve) {
        const cleanup = function() {
            $(document).off('keydown.employeeActionModal');
            $('#employee-modal-cancel, #employee-modal-close, #employee-action-modal .admin-modal__overlay').off('.employeeActionModal');
            $('#employee-modal-confirm').off('.employeeActionModal');
            $modal.stop(true, true).fadeOut(150, function() {
                $modal.attr('aria-hidden', 'true');
            });
        };

        const closeWith = function(result) {
            cleanup();
            resolve(result);
        };

        $('#employee-modal-cancel, #employee-modal-close, #employee-action-modal .admin-modal__overlay')
            .on('click.employeeActionModal', function() {
                closeWith({ confirmed: false });
            });

        $('#employee-modal-confirm').on('click.employeeActionModal', function() {
            const value = ($reasonInput.val() || '').trim();

            if (requireReason && value.length < minLength) {
                $reasonError.text(`Vui lòng nhập ít nhất ${minLength} ký tự.`).show();
                $reasonInput.trigger('focus');
                return;
            }

            $reasonError.hide().text('');
            closeWith({ confirmed: true, value: value });
        });

        $(document).on('keydown.employeeActionModal', function(e) {
            if (e.key === 'Escape') closeWith({ confirmed: false });
        });

        setTimeout(function() {
            if (requireReason) {
                $reasonInput.trigger('focus');
            } else {
                $confirm.trigger('focus');
            }
        }, 30);
    });
}

function openModal(id) {
    document.querySelectorAll('.modal-overlay.open').forEach(function (modal) {
        if (modal.id !== id) {
            modal.classList.remove('open');
        }
    });

    document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
}

function loadTaskImages(id) {
    $.ajax({
        url: `${API_BASE}/bao-cao/${id}`,
        method: "GET",
        headers: authHeader(),
        success: function (res) {
            const payload = res && res.data ? res.data : {};
            currentTaskLocation = getTaskCoordinates(payload.thong_tin) || currentTaskLocation;
            updateDirectionsButtonState();
            const images = Array.isArray(payload.hinh_anh) ? payload.hinh_anh : [];
            renderTaskImages(id, images);
        },
        error: function () {
            updateDirectionsButtonState();
            renderTaskImages(id, []);
        }
    });
}

async function openEmployeeReportDetail(id) {
    ensureEmployeeUi();

    try {
        const res = await window.apiRequest('GET', `/bao-cao/${id}`);
        const payload = res && res.data ? res.data : {};
        const info = payload.thong_tin || {};
        const images = Array.isArray(payload.hinh_anh) ? payload.hinh_anh : [];
        const timeline = Array.isArray(payload.lich_su) ? payload.lich_su : [];
        const tenNguoiBaoCao = info.nguoi_bao_cao || info.ten_nguoi_gui || info.ten_nguoi_dung || info.ho_ten || 'Khách / Ẩn danh';
        const $modal = $('#employee-report-detail-modal');

        bindEmployeeReportDetailEvents($modal);

        $('#employee-report-id').text('#' + id);
        $('#employee-report-title').text(info.tieu_de || 'Không có tiêu đề');
        $('#employee-report-address').text(info.dia_chi || 'Không rõ địa chỉ');
        $('#employee-report-type').text(info.loai_su_co || info.loai || 'Chưa phân loại');
        $('#employee-report-reporter').text(tenNguoiBaoCao);
        $('#employee-report-staff').text(info.nhan_vien_phu_trach || localStorage.getItem('ho_ten') || 'Chưa có nhân viên');
        $('#employee-report-description').text(info.mo_ta || 'Không có mô tả chi tiết');
        $('#employee-report-status')
            .text(formatTrangThai(info.trang_thai || 'cho_duyet'))
            .attr('class', 'badge ' + (info.trang_thai || 'cho_duyet'));

        renderEmployeeReportImages('#employee-report-original-images', images, 'bao_cao', 'Không có ảnh');
        renderEmployeeReportImages('#employee-report-completion-images', images, 'sau_sua_chua', 'Chưa có ảnh đối chứng');
        renderEmployeeReportTimeline('#employee-report-timeline', timeline);
        updateEmployeeReportDirectionsButton(id, info);

        $modal.stop(true, true).fadeIn(150).attr('aria-hidden', 'false');
    } catch (err) {
        showToast(err?.loi || err?.error || 'Không tải được chi tiết báo cáo', true);
    }
}

function bindEmployeeReportDetailEvents($modal) {
    $modal.find('#employee-report-close, .admin-modal__overlay')
        .off('click.employeeReportDetail')
        .on('click.employeeReportDetail', function () {
            $modal.stop(true, true).fadeOut(150).attr('aria-hidden', 'true');
        });
}

function renderEmployeeReportImages(containerSelector, images, imageType, emptyText) {
    const $container = $(containerSelector).empty();
    const filtered = images.filter(function (image) {
        return image && image.loai_anh === imageType && image.duong_dan_anh;
    });

    if (!filtered.length) {
        $container.html(`<small style="color:#999">${escapeHtml(emptyText)}</small>`);
        return;
    }

    const html = filtered.map(function (image, index) {
        const src = escapeHtmlAttr(image.duong_dan_anh);
        const alt = imageType === 'bao_cao' ? `Ảnh hiện trường ${index + 1}` : `Ảnh hoàn thành ${index + 1}`;
        return `<img src="${src}" data-src="${src}" class="report-image-thumb" alt="${escapeHtmlAttr(alt)}">`;
    }).join('');

    $container.html(html);
}

function renderEmployeeReportTimeline(containerSelector, timeline) {
    const $timeline = $(containerSelector).empty();

    if (!timeline.length) {
        $timeline.html('<div class="report-image-empty">Chưa có lịch sử trạng thái.</div>');
        return;
    }

    timeline.forEach(function (entry) {
        $timeline.append(`
            <div style="margin-bottom:10px;font-size:13px;padding-left:15px;border-left:2px solid #ddd;position:relative;">
                <div style="position:absolute;left:-6px;top:4px;width:10px;height:10px;background:#ccc;border-radius:50%;"></div>
                <strong>${escapeHtml(formatDateTime(entry.ngay_doi) || '—')}</strong>:
                <span style="color:#888;">${escapeHtml(formatTrangThai(entry.trang_thai_cu || 'Mới'))}</span>
                &rarr;
                <span class="text-primary" style="font-weight:600;">${escapeHtml(formatTrangThai(entry.trang_thai_moi || ''))}</span>
                ${entry.ghi_chu ? `<div style="font-style:italic;color:#666;margin-top:2px;">- Ghi chú: ${escapeHtml(entry.ghi_chu)}</div>` : ''}
                ${entry.ten_nguoi_doi ? `<div style="font-size:12px;color:#666;margin-top:2px;">by ${escapeHtml(entry.ten_nguoi_doi)}</div>` : ''}
            </div>
        `);
    });
}

function updateEmployeeReportDirectionsButton(id, info) {
    const lat = Number(info.vi_do);
    const lng = Number(info.kinh_do);
    const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng);

    $('#employee-report-directions')
        .prop('disabled', !hasCoordinates)
        .css({
            opacity: hasCoordinates ? '1' : '0.55',
            cursor: hasCoordinates ? 'pointer' : 'not-allowed'
        })
        .attr('title', hasCoordinates ? 'Mở bản đồ chỉ đường đến vị trí báo cáo' : 'Báo cáo này chưa có tọa độ để chỉ đường')
        .off('click.employeeReportDirections')
        .on('click.employeeReportDirections', function () {
            if (!hasCoordinates) return;

            const params = new URLSearchParams({
                lat: String(lat),
                lng: String(lng),
                route: '1',
                reportId: String(id),
                source: 'nhan_vien'
            });

            if (info.tieu_de) params.set('title', info.tieu_de);

            window.location.href = `../user/ban_do2.html?${params.toString()}`;
        });
}

function getTaskCoordinates(task) {
    if (!task) return null;

    const lat = Number(task.vi_do);
    const lng = Number(task.kinh_do);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng };
}

function updateDirectionsButtonState() {
    const hasLocation = !!(currentTaskLocation && Number.isFinite(currentTaskLocation.lat) && Number.isFinite(currentTaskLocation.lng));
    $('#btn-chi-duong')
        .prop('disabled', !hasLocation)
        .attr('title', hasLocation ? 'Mở bản đồ chỉ đường đến vị trí báo cáo' : 'Báo cáo này chưa có tọa độ để chỉ đường');
}

function openDirectionsForCurrentTask() {
    if (!currentTaskId) {
        showToast('Không xác định được báo cáo để chỉ đường', true);
        return;
    }

    const location = currentTaskLocation || getTaskCoordinates(taskMap[currentTaskId]);
    if (!location) {
        showToast('Báo cáo này chưa có tọa độ để chỉ đường', true);
        return;
    }

    const task = taskMap[currentTaskId] || {};
    const params = new URLSearchParams({
        lat: String(location.lat),
        lng: String(location.lng),
        route: '1',
        reportId: String(currentTaskId),
        source: 'nhan_vien'
    });

    if (task.tieu_de) params.set('title', task.tieu_de);

    window.location.href = `../user/ban_do2.html?${params.toString()}`;
}

function renderTaskImages(id, images) {
    if (currentTaskId !== id) return;

    const originals = images.filter(function (img) {
        return img && img.loai_anh === 'bao_cao' && img.duong_dan_anh;
    });
    const completions = images.filter(function (img) {
        return img && img.loai_anh === 'sau_sua_chua' && img.duong_dan_anh;
    });

    if (!originals.length) {
        $('#mn-images').html('<div class="report-image-empty">Không có ảnh hiện trạng từ người báo cáo.</div>');
    } else {
        const originalsHtml = originals.map(function (img, index) {
            const src = escapeHtmlAttr(img.duong_dan_anh);
            return `<img class="report-image-thumb" src="${src}" data-src="${src}" alt="Ảnh hiện trạng ${index + 1}">`;
        }).join('');

        $('#mn-images').html(originalsHtml);
    }

    if (!completions.length) {
        $('#mn-completion-images').html('<div class="report-image-empty">Chưa có ảnh sau xử lý từ nhân viên.</div>');
        return;
    }

    const completionHtml = completions.map(function (img, index) {
        const src = escapeHtmlAttr(img.duong_dan_anh);
        return `<img class="report-image-thumb" src="${src}" data-src="${src}" alt="Ảnh sau xử lý ${index + 1}">`;
    }).join('');

    $('#mn-completion-images').html(completionHtml);
}

function openImageViewer(src) {
    $('#image-viewer-src').attr('src', src || '');
    openModal('modal-image-viewer');
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeHtmlAttr(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function handleCompletionFileSelection(event) {
    const files = Array.from((event.target && event.target.files) || []);

    if (!files.length) {
        syncCompletionInput();
        return;
    }

    files.forEach(function (file) {
        if (!file || !String(file.type || '').startsWith('image/')) return;

        const duplicate = completionFiles.some(function (item) {
            return item.file.name === file.name
                && item.file.size === file.size
                && item.file.lastModified === file.lastModified;
        });
        if (duplicate) return;

        completionFiles.push({
            file: file,
            previewUrl: URL.createObjectURL(file)
        });
    });

    syncCompletionInput();
    renderCompletionPreview();
}

function removeCompletionFile(index) {
    if (index < 0 || index >= completionFiles.length) return;

    const removed = completionFiles.splice(index, 1)[0];
    if (removed && removed.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
    }

    syncCompletionInput();
    renderCompletionPreview();
}

function syncCompletionInput() {
    const input = document.getElementById('upload-after');
    if (!input) return;

    const dataTransfer = new DataTransfer();
    completionFiles.forEach(function (item) {
        dataTransfer.items.add(item.file);
    });
    input.files = dataTransfer.files;
}

function renderCompletionPreview() {
    const $preview = $('#upload-after-preview');
    if (!$preview.length) return;

    if (!completionFiles.length) {
        $preview.html('<div class="report-image-empty">Chưa chọn ảnh nào.</div>');
        return;
    }

    const html = completionFiles.map(function (item, index) {
        const src = escapeHtmlAttr(item.previewUrl);
        const name = escapeHtmlAttr(item.file.name);
        const size = formatFileSize(item.file.size);

        return `
            <div class="upload-preview-card">
                <button type="button" class="upload-preview-remove" data-index="${index}" aria-label="Bỏ ảnh">&times;</button>
                <img src="${src}" alt="${name}">
                <div class="upload-preview-meta">
                    <span class="upload-preview-name" title="${name}">${name}</span>
                    <span class="upload-preview-size">${size}</span>
                </div>
            </div>
        `;
    }).join('');

    $preview.html(html);
}

function formatFileSize(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return value + ' B';
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
    return (value / (1024 * 1024)).toFixed(1) + ' MB';
}

/* ============================================================
   THÔNG BÁO — polling cho nhân viên
   ============================================================ */
function batDauPollingNhanVien() {
    const token = localStorage.getItem('token');
    if (!token) return;

    async function kiemTra() {
        const tuId = parseInt(localStorage.getItem('last_lich_su_id') || '0');
        try {
            const res = await fetch(API_BASE + '/bao-cao/thong-bao?tu_id=' + tuId, {
                headers: { 'Authorization': 'Bearer ' + token, 'ngrok-skip-browser-warning': 'true' }
            });
            if (!res.ok) return;
            const data = await res.json();
            if (!Array.isArray(data) || data.length === 0) return;

            const maxId = Math.max(...data.map(n => n.lich_su_id));
            localStorage.setItem('last_lich_su_id', maxId);

            // Tự động reload danh sách việc khi có thông báo mới
            fetchTasks();

            data.forEach((tb, i) => {
                setTimeout(() => hienThongBaoNV(tb.noi_dung, tb.tieu_de), i * 1500);
            });
        } catch (e) {}
    }

    setTimeout(kiemTra, 300);
    setInterval(kiemTra, 300);
}

function hienThongBaoNV(noiDung, tieuDe) {
    let container = document.getElementById('thongbao-stack');
    if (!container) {
        container = document.createElement('div');
        container.id = 'thongbao-stack';
        container.style.cssText = 'position:fixed;bottom:24px;right:24px;display:flex;flex-direction:column;gap:8px;z-index:99999;max-width:320px;';
        document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.style.cssText = 'background:#1e293b;color:#fff;border-left:4px solid #22c55e;padding:14px 18px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.35);font-size:13px;line-height:1.5;cursor:pointer;';
    el.innerHTML = '<div style="font-weight:700;margin-bottom:4px">🔔 Thông báo</div>' +
        '<div>' + noiDung + '</div>' +
        '<div style="color:rgba(255,255,255,.45);font-size:11px;margin-top:4px">' + tieuDe + '</div>';
    el.onclick = () => el.remove();
    container.appendChild(el);
    setTimeout(() => el.remove(), 6000);
}
