// ============================================================
//  nhanVien.js  –  Workflow nhân viên xử lý sự cố
//  Bước 1: Nhận / Từ chối (da_phan_cong)
//  Bước 2: Đang làm       (dang_xu_ly)
//  Bước 3: Báo hoàn thành (upload ảnh + ghi chú)
//  Bước 4: Chờ nghiệm thu (cho_nghiem_thu) – chỉ xem
//  Bước 5: Hoàn thành     – sang tab Đã hoàn thành
// ============================================================

const API_BASE = "http://127.0.0.1:5000";

// ============ STATE ============
let currentTaskId = null;   // ID task đang thao tác trong modal
let taskMap = {};            // cache toàn bộ task { bao_cao_id: taskObject }

// ============ AUTH HELPER ============
function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

// ============ INIT ============
$(document).ready(function () {
     // ← chỉ nhân viên mới vào được

    // --- Kiểm tra đăng nhập ---
    if (!localStorage.getItem('token')) {
        showToast("Chưa đăng nhập", true);
        return;
    }

    // --- Load dữ liệu ban đầu ---
    fetchTasks();

    // --- Hiển thị tên nhân viên ---
    const name = localStorage.getItem("user_name");
    if (name) $('#user-name').text(name);

    // --- User dropdown ---
    $('.user-badge').click(function (e) {
        e.stopPropagation();
        $('.user-dropdown').toggleClass('show');
    });
    $(document).click(function () {
        $('.user-dropdown').removeClass('show');
    });
    $('.user-dropdown').click(function (e) { e.stopPropagation(); });

    // --- Mobile menu ---
    $('#btn-menu').click(function () {
        $('.sidebar').toggleClass('open');
    });

    // --- Sidebar navigation ---
    $('.menu-item').click(function () {
        $('.menu-item').removeClass('active');
        $(this).addClass('active');
        $('.page').removeClass('active');

        const page = $(this).data('page');
        $(`#page-${page}`).addClass('active');

        if (page === 'da-hoan-thanh') loadDoneTasks();
        if (page === 'lich-su')       loadHistory();

        $('.sidebar').removeClass('open');
    });

    // --- Profile (AJAX load) ---
    $('#btn-profile').click(function (e) {
        e.preventDefault();
        $('.page').removeClass('active');
        $('#page-profile').load('/FrontEnd/html/NhanVien/profileNV.html .container', function () {
            $('#page-profile').addClass('active');
            if (typeof initProfilePage === "function") initProfilePage();
        });
        $('.sidebar').removeClass('open');
    });

    // --- Logout ---
    $('#logout-btn').click(function () {
        localStorage.removeItem("token");
        window.location.href = "/FrontEnd/html/login.html";
    });

    // --- Filter: Đã hoàn thành ---
    $('#filter-month-done').on('change', loadDoneTasks);

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
    $('#btn-tu-choi').off('click').on('click', function () {
        if (!currentTaskId) return;
        apiTuChoi(currentTaskId, function () {
            closeModal('modal-nhan-viec');
        });
    });

    // Nút "Báo hoàn thành" trong modal chi tiết (dang_xu_ly)
    $('#btn-open-hoan-thanh').off('click').on('click', function () {
        if (!currentTaskId) return;
        closeModal('modal-nhan-viec');
        openModalHoanThanh(currentTaskId);
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

        const files = $('#upload-after')[0].files;
        if (!files || files.length === 0) {
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
        e.stopPropagation();
        const id = $(this).closest('.task-card').data('id');
        if (!id) return;
        apiTuChoi(id);
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
            showToast(xhr.responseJSON?.loi || "Lỗi tải dữ liệu", true);
        }
    });
}

/**
 * Bước 1 – Nhận việc
 * Trạng thái: da_phan_cong → dang_xu_ly
 */
function apiNhanViec(id) {
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
function apiTuChoi(id, callback) {
    if (!confirm("Bạn chắc chắn muốn từ chối việc này?")) return;

    $.ajax({
        url: `${API_BASE}/nhan-vien/bao-cao/${id}/tu-choi`,
        method: "PUT",
        headers: authHeader(),
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
function apiHoanThanh(id, onSuccess, onError) {
    const formData = new FormData();
    formData.append("ghi_chu", $('#note-hoan-thanh').val() || "");

    const files = $('#upload-after')[0].files;
    for (let i = 0; i < files.length; i++) {
        formData.append("images", files[i]);
    }

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
                tbody.append('<tr><td colspan="5" style="text-align:center;color:#999">Chưa có dữ liệu</td></tr>');
                return;
            }
            data.forEach(item => {
                tbody.append(`
                    <tr>
                        <td>${item.bao_cao_id}</td>
                        <td>${item.tieu_de}</td>
                        <td>${item.loai_su_co}</td>
                        <td>${item.ngay_xong || '—'}</td>
                        <td><span class="badge badge-done">Hoàn thành</span></td>
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
                tbody.append('<tr><td colspan="6" style="text-align:center;color:#999">Không có lịch sử</td></tr>');
                return;
            }
            data.forEach(item => {
                tbody.append(`
                    <tr>
                        <td>${item.bao_cao_id}</td>
                        <td>${item.tieu_de}</td>
                        <td>${item.loai_su_co}</td>
                        <td>${item.ngay_doi}</td>
                        <td>${formatTrangThai(item.trang_thai_moi)}</td>
                        <td>${item.ghi_chu || '—'}</td>
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
            <div class="task-card" data-id="${id}" onclick="openTaskDetail(${id})">
                <div class="task-title">${task.tieu_de}</div>
                <div class="task-meta">${task.dia_chi}</div>
                <div class="task-meta">${task.loai_su_co}</div>
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
    $(selector)[count > 0 ? 'show' : 'hide']();
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
    $('#mn-time').text(task.ngay_tao);
    $('#mn-attempt').text(task.lan_thu || 1);
    $('#mn-mota').text(task.mo_ta || '—');

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
}


// ============================================================
//  MODAL HOÀN THÀNH (Bước 3)
// ============================================================

function openModalHoanThanh(id) {
    currentTaskId = id;

    resetFormHoanThanh();

    $('#error-hoan-thanh').hide().text(""); // ✅ chuẩn

    $('#btn-confirm-hoan').prop('disabled', false).text('Gửi');

    openModal('modal-hoan-thanh');
}

function resetFormHoanThanh() {
    $('#note-hoan-thanh').val('');
    $('#upload-after').val('');
}


// ============================================================
//  HELPERS
// ============================================================

function formatTrangThai(status) {
    const map = {
        'da_phan_cong':    'Được giao',
        'dang_xu_ly':      'Đang xử lý',
        'cho_nghiem_thu':  'Chờ nghiệm thu',
        'hoan_thanh':      'Hoàn thành',
        'tu_choi':         'Đã từ chối',
        'da_xu_ly':        'Đã xử lý',
        'da_duyet':        'Chờ phân công lại',
    };
    return map[status] || status;
}

function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' error' : '');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 600);
}

function openModal(id) {
    document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
}
