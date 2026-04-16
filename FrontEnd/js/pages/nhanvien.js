// FILE: js/pages/nhanvien.js
(function (window, $) {
    'use strict';

    window.loadNhanVien = async function(page = 1, limit = 10) {
        try {
            const res = await window.apiRequest('GET', '/admin/nguoi-dung');
            const users = res.danh_sach || res.data || res || [];
            const pagination = typeof window.paginateArray === 'function'
                ? window.paginateArray([], page, limit)
                : { data: [], total: 0, currentPage: page, pageSize: limit };

            // Lọc chỉ lấy nhân viên
            const staff = users.filter(u => (u.vai_tro === 'nhan_vien' || u.vai_tro === 'nhân_vien'));

            // LƯU CACHE DANH SÁCH
            window.currentStaffList = staff;

            pagination.total = staff.length;
            pagination.pageSize = limit;
            pagination.currentPage = page;
            pagination.data = staff.slice((page - 1) * limit, page * limit);
            const visibleStaff = pagination.data || [];

            // Cập nhật thẻ thống kê
            $('#stat-total-staff').text(staff.length || 0);
            $('#stat-available').text(staff.filter(s => !s.dang_hoat_dong && !s.bi_dinh_chi).length || 0);
            $('#stat-busy').text(staff.filter(s => s.dang_hoat_dong && !s.bi_dinh_chi).length || 0);

            const $tb = $('#table-body-nhan-vien');
            $tb.empty();

            if (!staff.length) {
                $tb.append('<tr><td colspan="5" class="text-center">Không có nhân viên nào</td></tr>');
                if (typeof window.renderPagination === 'function') {
                    window.renderPagination({
                        key: 'staff',
                        anchor: '#table-body-nhan-vien',
                        currentPage: 1,
                        pageSize: pagination.pageSize,
                        totalItems: 0,
                        onPageChange: function (nextPage, nextLimit) {
                            window.loadNhanVien(nextPage, nextLimit);
                        }
                    });
                }
                return;
            }

            visibleStaff.forEach(function(s) {
                const id = s.nguoi_dung_id || s.id || '';
                const avatarChar = s.ho_ten ? s.ho_ten.charAt(0).toUpperCase() : '?';

                let statusText = 'Sẵn sàng';
                let statusColor = 'green';

                if (s.bi_dinh_chi) {
                    statusText = 'Bị đình chỉ';
                    statusColor = 'red';
                } else if (s.dang_hoat_dong) {
                    statusText = 'Đang làm việc';
                    statusColor = 'orange';
                }

                const $tr = $('<tr/>');

                $tr.append($('<td/>').html(`
                    <div class="user-info" style="display: flex; align-items: center; gap: 10px;">
                        <div class="avatar" style="width:36px;height:36px;background:#198754;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;">${avatarChar}</div>
                        <div class="name-details" style="display:flex; flex-direction:column;">
                            <strong>${s.ho_ten || 'Chưa cập nhật'}</strong>
                            <span style="color:#777; font-size: 12px;">ID: ${id}</span>
                        </div>
                    </div>
                `));

                $tr.append($('<td/>').text(s.email || 'Không có email'));

                // Tạm thời hiển thị 0 ở bảng ngoài, sẽ đếm chính xác khi vào chi tiết
                $tr.append($('<td/>').text(s.so_cong_viec || s.viec_dang_lam || '0'));
                $tr.append($('<td/>').html(`<span class="badge ${statusColor}">${statusText}</span>`));

                $tr.append($('<td/>').html(`
                    <button class="btn-action btn-view-staff" data-id="${id}">Chi tiết</button>
                `));
                
                $tb.append($tr);
            });

            if (typeof window.renderPagination === 'function') {
                window.renderPagination({
                    key: 'staff',
                    anchor: '#table-body-nhan-vien',
                    currentPage: pagination.currentPage,
                    pageSize: pagination.pageSize,
                    totalItems: pagination.total,
                    onPageChange: function (nextPage, nextLimit) {
                        window.loadNhanVien(nextPage, nextLimit);
                    }
                });
            }
        } catch (err) { window.showApiError(err); }
    };

    // ============================================================
    // 2. MODAL CHI TIẾT NHÂN VIÊN VÀ LỊCH SỬ CÔNG VIỆC
    // ============================================================
    window.loadStaffDetail = async function(id) {
        const staffList = window.currentStaffList || [];
        const s = staffList.find(user => (user.nguoi_dung_id || user.id).toString() === id.toString());

        if (!s) return alert('Không tìm thấy dữ liệu nhân viên!');

        // Dựng khung Modal
        if ($('#staffDetailModal').length === 0) {
            const modalHtml = `
            <div id="staffDetailModal" style="display:none;position:fixed;inset:0;z-index:9999;">
                <div class="sd-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);"></div>
                <div class="sd-content" style="position:relative;max-width:600px;margin:50px auto;background:#fff;border-radius:12px;padding:25px;box-shadow:0 10px 30px rgba(0,0,0,0.2); max-height:85vh; overflow-y:auto;">
                    <button class="sd-close" style="position:absolute;right:15px;top:15px;border:none;background:none;font-size:28px;cursor:pointer;color:#888;">&times;</button>
                    <h3 style="margin-top:0; border-bottom: 1px solid #eee; padding-bottom: 10px; color:#333;">Hồ sơ Nhân viên</h3>

                    <div style="display:flex; gap: 20px; align-items: center; margin: 20px 0;">
                        <div id="sd-avatar" style="width:70px; height:70px; border-radius:50%; background:#198754; color:#fff; display:flex; align-items:center; justify-content:center; font-size:28px; font-weight:bold; box-shadow: 0 4px 10px rgba(25, 135, 84, 0.3);"></div>
                        <div>
                            <h2 id="sd-name" style="margin:0; color:#333; font-size: 20px;"></h2>
                            <p id="sd-email" style="margin:5px 0 0 0; color:#666; font-size:14px;"></p>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:20px;">
                        <div style="background:#f8f9fa; padding:12px; border-radius:8px; border:1px solid #e9ecef;">
                            <small style="color:#777; display:block; margin-bottom:4px;">Trạng thái hiện tại</small>
                            <div id="sd-status"></div>
                        </div>
                        <div style="background:#f8f9fa; padding:12px; border-radius:8px; border:1px solid #e9ecef;">
                            <small style="color:#777; display:block; margin-bottom:4px;">Ngày bắt đầu</small>
                            <strong id="sd-date" style="color:#333;"></strong>
                        </div>
                        <div style="background:#e8f4f8; padding:12px; border-radius:8px; border:1px solid #d1e5f0; grid-column: 1 / -1; display:flex; justify-content:space-between; align-items:center;">
                            <span style="color:#0056b3; font-weight:600;">Việc đang xử lý:</span>
                            <span id="sd-tasks-active" style="font-size:18px; font-weight:bold; color:#0d6efd; background:white; padding:2px 10px; border-radius:12px;">Đang tải...</span>
                        </div>
                    </div>

                    <h4 style="margin-bottom:10px; color:#444; border-left:3px solid #198754; padding-left:8px;">Lịch sử công việc</h4>
                    <div id="sd-logs" style="background:#fcfcfc; border:1px solid #eee; border-radius:8px; padding:10px; max-height:200px; overflow-y:auto; margin-bottom:20px; font-size:13px;">
                        <div style="text-align:center; color:#888;">Đang lấy dữ liệu...</div>
                    </div>

                    <div id="sd-actions" style="text-align: right; display: flex; justify-content: flex-end; padding-top: 15px; border-top: 1px solid #eee;"></div>
                </div>
            </div>`;
            $(document.body).append(modalHtml);
            $('#staffDetailModal .sd-close, #staffDetailModal .sd-overlay').on('click', () => $('#staffDetailModal').fadeOut(150));
        }

        // Đổ dữ liệu tĩnh
        const avatarChar = s.ho_ten ? s.ho_ten.charAt(0).toUpperCase() : '?';
        $('#sd-avatar').text(avatarChar);
        $('#sd-name').text(s.ho_ten || 'Chưa cập nhật');
        $('#sd-email').text(s.email || 'Không có email');

        const dateStr = s.ngay_tao ? (window.formatToTZ ? window.formatToTZ(s.ngay_tao, {dateOnly:true}) : s.ngay_tao.split('T')[0]) : 'Chưa rõ';
        $('#sd-date').text(dateStr);

        let statusText = 'Sẵn sàng', statusColor = 'green';
        if (s.bi_dinh_chi) { statusText = 'Bị đình chỉ'; statusColor = 'red'; }
        else if (s.dang_hoat_dong) { statusText = 'Đang làm việc'; statusColor = 'orange'; }
        $('#sd-status').html(`<span class="badge ${statusColor}">${statusText}</span>`);

        $('#sd-tasks-active').text('Đang tải...');
        $('#sd-logs').html('<div style="text-align:center; color:#888; padding:10px;">Đang lấy dữ liệu...</div>');

        // Nút hành động
        const $actions = $('#sd-actions').empty();
        if (!s.bi_dinh_chi) {
            $actions.append(`<button class="btn-action btn-suspend" style="background:#dc3545; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;" data-id="${id}">Đình chỉ công tác</button>`);
        } else {
            $actions.append(`<button class="btn-action btn-unsuspend" style="background:#28a745; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;" data-id="${id}">Gỡ đình chỉ</button>`);
        }

        $('#staffDetailModal').fadeIn(150);

        // GỌI API TÌM VIỆC CỦA NHÂN VIÊN NÀY
        let tasks = [];
        try {
            // Sử dụng API Dashboard (lấy tất cả báo cáo) để lọc ra việc của nhân viên này
            let dashRes = await window.apiRequest('GET', `/admin_get/dashboard?page=1&limit=500`);
            if (dashRes && dashRes.list && Array.isArray(dashRes.list.data)) {
                tasks = dashRes.list.data.filter(r =>
                    (r.nhan_vien_id && String(r.nhan_vien_id) === String(id)) ||
                    (r.nhan_vien_phu_trach && r.nhan_vien_phu_trach === s.ho_ten) ||
                    (r.nhan_vien && r.nhan_vien === s.ho_ten)
                );
            }
        } catch (err) {
            console.warn("Lỗi tải việc của nhân viên:", err);
        }

        // Đếm việc ĐANG XỬ LÝ
        const activeTasks = tasks.filter(t => t.trang_thai === 'dang_xu_ly' || t.trang_thai === 'cho_nghiem_thu');
        $('#sd-tasks-active').text(`${activeTasks.length} việc`);

        // Render Lịch sử công việc
        const $logs = $('#sd-logs').empty();
        if (tasks.length > 0) {
            tasks.forEach(t => {
                const d = t.ngay_trang_thai || t.ngay_tao || '';
                const dateFmt = d ? d.split('T')[0] : '';
                const statusStr = (t.trang_thai || '').replace(/_/g, ' ').toUpperCase();

                let stColor = '#555';
                if(t.trang_thai === 'dang_xu_ly') stColor = '#fd7e14';
                if(t.trang_thai === 'da_xu_ly') stColor = '#198754';
                if(t.trang_thai === 'cho_nghiem_thu') stColor = '#0dcaf0';

                $logs.append(`
                    <div style="padding:8px; border-bottom:1px dashed #ddd; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong style="color:#333; display:block;">${t.tieu_de || 'Sự cố'}</strong>
                            <span style="color:#777; font-size:11px;">Mã BC: #${t.bao_cao_id || t.id}</span>
                        </div>
                        <div style="text-align:right; font-size:11px;">
                            <span style="color:#888;">${dateFmt}</span><br>
                            <strong style="color:${stColor};">${statusStr}</strong>
                        </div>
                    </div>
                `);
            });
        } else {
            $logs.append('<div style="text-align:center; color:#999; padding:15px;">Nhân viên này chưa được phân công việc nào.</div>');
        }
    };


    // ============================================================
    // 3. EVENT LISTENERS
    // ============================================================
    $(document).on('click', '.btn-view-staff', function() {
        window.loadStaffDetail($(this).data('id'));
    });

    $(document).on('click', '.btn-suspend', async function() {
        const id = $(this).data('id');
        const reason = prompt('Nhập lý do đình chỉ nhân viên này:');
        if (!reason) return;

        try {
            await window.apiRequest('PUT', `/admin/nguoi-dung/${id}/dinh-chi`, { ly_do: reason });
            alert('Đã đình chỉ nhân viên thành công.');
            $('#staffDetailModal').fadeOut(100);
            window.loadNhanVien();
        } catch (e) { window.showApiError(e); }
    });

    $(document).on('click', '.btn-unsuspend', async function() {
        const id = $(this).data('id');
        if (!confirm('Bạn có chắc chắn muốn gỡ đình chỉ cho nhân viên này?')) return;

        try {
            await window.apiRequest('PUT', `/admin/nguoi-dung/${id}/dinh-chi`);
            alert('Đã gỡ đình chỉ thành công.');
            $('#staffDetailModal').fadeOut(100);
            window.loadNhanVien();
        } catch (e) { window.showApiError(e); }
    });

})(window, jQuery);
