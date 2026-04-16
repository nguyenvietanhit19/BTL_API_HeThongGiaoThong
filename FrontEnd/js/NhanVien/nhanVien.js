// ============ CẤU HÌNH ============
const API_BASE = "http://127.0.0.1:5000";

// ============ INIT ============
let currentTaskId = null;

// ============ DOM READY ============
document.addEventListener("DOMContentLoaded", () => {

    if (!localStorage.getItem('token')) {
        showToast("Chưa đăng nhập", true);
        return;
    }

    fetchTasks();

    // ===== HIỂN THỊ TÊN USER =====
    const name = localStorage.getItem("user_name");
    if (name) {
        const el = document.getElementById("user-name");
        if (el) el.textContent = name;
    }

    // ===== SIDEBAR NAV =====
    const menuItems = document.querySelectorAll('.menu-item');

    menuItems.forEach(item => {
        item.addEventListener('click', () => {

            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

            const page = item.dataset.page;
            const target = document.getElementById(`page-${page}`);
            if (target) target.classList.add('active');

            // load theo tab
            if (page === 'da-hoan-thanh') loadDoneTasks();
            if (page === 'lich-su') loadHistory();
        });
    });

    // ===== FILTER =====
    $('#filter-month-done').on('change', loadDoneTasks);

    $('#search-history, #filter-status, #filter-month-history')
        .on('input change', loadHistory);

    // ===== BTN HOÀN THÀNH =====
    const btn = document.getElementById('btn-confirm-hoan');
    if (btn) {
        btn.onclick = () => {
            if (!currentTaskId) return;
            baoHoanThanhAPI(currentTaskId);
        };
    }

    // ===== PROFILE =====
        $('#btn-profile').click(function (e) {
        e.preventDefault();

        // ẩn tất cả page
        $('.page').removeClass('active');

        // load HTML vào page-profile
        $('#page-profile').load('/FrontEnd/html/NhanVien/profileNV.html .container', function () {
            $('#page-profile').addClass('active');

            // 👉 GỌI INIT PROFILE SAU KHI LOAD
            initProfilePage();
        });
    });

    // ===== LOGOUT =====
    $('#logout-btn').click(function () {
        localStorage.removeItem("token");
        window.location.href = "/FrontEnd/html/login.html";
    });
});


// ============ API ============
function fetchTasks() {
    $.ajax({
        url: `${API_BASE}/nhan-vien/viec-cua-toi`,
        method: "GET",
        headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        success: function (data) {
            renderTasks(data.danh_sach);
        },
        error: function (xhr) {
            showToast(xhr.responseJSON?.loi || "Lỗi tải dữ liệu", true);
        }
    });
}

function baoHoanThanhAPI(id) {
    $.ajax({
        url: `${API_BASE}/nhan-vien/bao-cao/${id}/hoan-thanh`,
        method: "PUT",
        headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        success: function () {
            showToast("Đã báo hoàn thành!");
            fetchTasks();
            closeModal('modal-hoan-thanh');
        },
        error: function (xhr) {
            showToast(xhr.responseJSON?.loi || "Lỗi server", true);
        }
    });
}


// ============ RENDER ============
function getStatusLabel(status) {
    switch (status) {
        case 'dang_xu_ly': return 'Đang xử lý';
        case 'cho_nghiem_thu': return 'Chờ nghiệm thu';
        default: return status;
    }
}

function renderTasks(tasks) {
    const list = $('#task-list');
    list.empty();

    let dang = 0, cho = 0;

    tasks.forEach(task => {

        if (task.trang_thai === 'dang_xu_ly') dang++;
        else if (task.trang_thai === 'cho_nghiem_thu') cho++;

        list.append(`
            <div class="task-card">
                <div class="task-header">
                    <span class="task-title">${task.tieu_de}</span>
                    <span class="task-badge">${getStatusLabel(task.trang_thai)}</span>
                </div>

                <div class="task-meta">${task.dia_chi}</div>
                <div class="task-meta">Loại: ${task.loai_su_co}</div>

                <div class="btn-row" style="margin-top:10px;">
                    ${
                        task.trang_thai === 'dang_xu_ly'
                        ? `<button class="btn btn-primary" onclick="openHoanThanh(${task.bao_cao_id})">Báo hoàn thành</button>`
                        : `<span class="tag">Chờ nghiệm thu</span>`
                    }
                </div>
            </div>
        `);
    });

    $('#menu-count').text(tasks.length);
    $('#stat-moi').text(0);
    $('#stat-dang').text(dang);
    $('#stat-done').text(cho);
}


// ============ TAB DATA ============
function loadDoneTasks() {
    const month = $('#filter-month-done').val();

    $.ajax({
        url: `${API_BASE}/nhan-vien/da-hoan-thanh`,
        method: "GET",
        data: { month },
        headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        success: function (data) {
            const tbody = $('#done-table-body');
            tbody.empty();

            data.forEach(item => {
                tbody.append(`
                    <tr>
                        <td>${item.bao_cao_id}</td>
                        <td>${item.tieu_de}</td>
                        <td>${item.loai_su_co}</td>
                        <td>${item.ngay_xong || ''}</td>
                        <td>Hoàn thành</td>
                    </tr>
                `);
            });
        }
    });
}

function loadHistory() {
    const search = $('#search-history').val();
    const status = $('#filter-status').val();
    const month = $('#filter-month-history').val();

    $.ajax({
        url: `${API_BASE}/nhan-vien/lich-su`,
        method: "GET",
        data: { search, status, month },
        headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        success: function (data) {
            const tbody = $('#history-table-body');
            tbody.empty();

            data.forEach(item => {
                tbody.append(`
                    <tr>
                        <td>${item.bao_cao_id}</td>
                        <td>${item.tieu_de}</td>
                        <td>${item.loai_su_co}</td>
                        <td>${item.ngay_doi}</td>
                        <td>${item.trang_thai_moi}</td>
                        <td>${item.ghi_chu || ''}</td>
                    </tr>
                `);
            });
        }
    });
}


// ============ UI ============
function openHoanThanh(id) {
    currentTaskId = id;
    openModal('modal-hoan-thanh');
}

function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' error' : '');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function openModal(id) {
    document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
}