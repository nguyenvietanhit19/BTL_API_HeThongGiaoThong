(function(window, $) {
    'use strict';

    function getNhanVienPaging() {
        return {
            page: window.getPaginationPage ? window.getPaginationPage('staff', 1) : 1,
            limit: window.getPaginationPageSize ? window.getPaginationPageSize('staff', 5) : 5
        };
    }

    function getStaffStatusInfo(staff) {
        if (staff.bi_dinh_chi) return { text: 'Bị đình chỉ', color: 'red status-suspended', rowClass: 'state-row-suspended', panelClass: 'status-suspended', key: 'suspended' };
        if (staff.dang_hoat_dong) return { text: 'Đang làm việc', color: 'orange', rowClass: '', panelClass: '', key: 'busy' };
        return { text: 'Sẵn sàng', color: 'green', rowClass: '', panelClass: '', key: 'available' };
    }

    function getStaffFilters() {
        return {
            keyword: ($('#search-staff').val() || '').trim().toLowerCase(),
            status: ($('#filter-staff-status').val() || '').trim().toLowerCase()
        };
    }

    function filterStaffList(staffList) {
        const filters = getStaffFilters();

        return (staffList || []).filter(function(staff) {
            const statusInfo = getStaffStatusInfo(staff);
            const haystack = [
                staff.ho_ten || '',
                staff.email || '',
                String(staff.nguoi_dung_id || staff.id || '')
            ].join(' ').toLowerCase();

            const matchesKeyword = !filters.keyword || haystack.includes(filters.keyword);
            const matchesStatus = !filters.status || statusInfo.key === filters.status;
            return matchesKeyword && matchesStatus;
        });
    }

    window.loadNhanVien = async function(page, limit) {
        page = page || 1;
        limit = limit || 10;

        try {
            const res = await window.apiRequest('GET', '/admin/nguoi-dung');
            const users = res.danh_sach || res.data || res || [];
            const staff = users.filter(function(user) {
                return user.vai_tro === 'nhan_vien' || user.vai_tro === 'nhân_viên';
            });
            const filteredStaff = filterStaffList(staff);

            window.currentStaffList = staff;

            const pagination = typeof window.paginateArray === 'function'
                ? window.paginateArray(filteredStaff, page, limit)
                : {
                    total: filteredStaff.length,
                    currentPage: page,
                    pageSize: limit,
                    data: filteredStaff.slice((page - 1) * limit, page * limit)
                };

            $('#stat-total-staff').text(filteredStaff.length || 0);
            $('#stat-available').text(filteredStaff.filter(function(s) { return getStaffStatusInfo(s).key === 'available'; }).length || 0);
            $('#stat-busy').text(filteredStaff.filter(function(s) { return getStaffStatusInfo(s).key === 'busy'; }).length || 0);

            const $tb = $('#table-body-nhan-vien');
            $tb.empty();

            if (!pagination.data.length) {
                $tb.append('<tr><td colspan="5" class="text-center" style="padding: 20px;">Không có dữ liệu nhân viên</td></tr>');
                if (typeof window.renderPagination === 'function') {
                    window.renderPagination({
                        key: 'staff',
                        anchor: '#table-body-nhan-vien',
                        currentPage: 1,
                        pageSize: limit,
                        totalItems: 0,
                        onPageChange: function(nextPage, nextLimit) {
                            window.loadNhanVien(nextPage, nextLimit);
                        }
                    });
                }
                return;
            }

            pagination.data.forEach(function(s) {
                const id = s.nguoi_dung_id || s.id || '';
                const avatarChar = s.ho_ten ? s.ho_ten.charAt(0).toUpperCase() : '?';
                const statusInfo = getStaffStatusInfo(s);

                const $tr = $('<tr/>').addClass(statusInfo.rowClass || '');
                $tr.append($('<td/>').html(`
                    <div class="user-info" style="display:flex;align-items:center;gap:10px;">
                        <div class="avatar" style="width:36px;height:36px;background:#198754;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;">${avatarChar}</div>
                        <div class="name-details" style="display:flex;flex-direction:column;">
                            <strong>${s.ho_ten || 'Chưa cập nhật'}</strong>
                            <span style="color:#777;font-size:12px;">ID: ${id}</span>
                        </div>
                    </div>
                `));
                $tr.append($('<td/>').text(s.email || 'Không có email'));
                $tr.append($('<td/>').text(s.so_cong_viec || s.viec_dang_lam || '0'));
                $tr.append($('<td/>').html(`<span class="badge ${statusInfo.color}">${statusInfo.text}</span>`));
                $tr.append($('<td/>').html(`<button class="btn-action btn-view-staff" data-id="${id}">Chi tiết</button>`));
                $tb.append($tr);
            });

            if (typeof window.renderPagination === 'function') {
                window.renderPagination({
                    key: 'staff',
                    anchor: '#table-body-nhan-vien',
                    currentPage: pagination.currentPage,
                    pageSize: pagination.pageSize,
                    totalItems: pagination.total,
                    onPageChange: function(nextPage, nextLimit) {
                        window.loadNhanVien(nextPage, nextLimit);
                    }
                });
            }
        } catch (err) {
            window.showApiError(err);
        }
    };

    window.loadStaffDetail = async function(id) {
        const staffList = window.currentStaffList || [];
        const s = staffList.find(function(user) {
            return String(user.nguoi_dung_id || user.id) === String(id);
        });

        if (!s) {
            window.showToast({
                type: 'error',
                title: 'Không tìm thấy nhân viên',
                message: 'Không tải được dữ liệu chi tiết của nhân viên này.'
            });
            return;
        }

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
                        <div id="sd-status-panel" class="status-panel" style="background:#f8f9fa; padding:12px; border-radius:8px; border:1px solid #e9ecef;">
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

                    <div id="sd-actions" style="text-align:right; display:flex; justify-content:flex-end; padding-top:15px; border-top:1px solid #eee;"></div>
                </div>
            </div>`;
            $(document.body).append(modalHtml);
            $('#staffDetailModal .sd-close, #staffDetailModal .sd-overlay').on('click', function() {
                $('#staffDetailModal').fadeOut(150);
            });
        }

        const avatarChar = s.ho_ten ? s.ho_ten.charAt(0).toUpperCase() : '?';
        $('#sd-avatar').text(avatarChar);
        $('#sd-name').text(s.ho_ten || 'Chưa cập nhật');
        $('#sd-email').text(s.email || 'Không có email');

        const dateStr = s.ngay_tao ? (window.formatToTZ ? window.formatToTZ(s.ngay_tao, { dateOnly: true }) : s.ngay_tao.split('T')[0]) : 'Chưa rõ';
        $('#sd-date').text(dateStr);

        const statusInfo = getStaffStatusInfo(s);
        $('#sd-status').html(`<span class="badge ${statusInfo.color}">${statusInfo.text}</span>`);
        $('#sd-status-panel').attr('class', `status-panel ${statusInfo.panelClass || ''}`);

        $('#sd-tasks-active').text('Đang tải...');
        $('#sd-logs').html('<div style="text-align:center; color:#888; padding:10px;">Đang lấy dữ liệu...</div>');

        const $actions = $('#sd-actions').empty();
        if (!s.bi_dinh_chi) {
            $actions.append(`<button class="btn-action btn-suspend" style="background:#dc3545; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;" data-id="${id}">Đình chỉ công tác</button>`);
        } else {
            $actions.append(`<button class="btn-action btn-unsuspend" style="background:#28a745; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;" data-id="${id}">Gỡ đình chỉ</button>`);
        }

        $('#staffDetailModal').fadeIn(150);

        let tasks = [];
        try {
            const dashRes = await window.apiRequest('GET', '/admin_get/dashboard?page=1&limit=500');
            if (dashRes && dashRes.list && Array.isArray(dashRes.list.data)) {
                tasks = dashRes.list.data.filter(function(r) {
                    return (r.nhan_vien_id && String(r.nhan_vien_id) === String(id))
                        || (r.nhan_vien_phu_trach && r.nhan_vien_phu_trach === s.ho_ten)
                        || (r.nhan_vien && r.nhan_vien === s.ho_ten);
                });
            }
        } catch (err) {
            console.warn('Lỗi tải việc của nhân viên:', err);
        }

        const activeTasks = tasks.filter(function(t) {
            return t.trang_thai === 'dang_xu_ly' || t.trang_thai === 'cho_nghiem_thu';
        });
        $('#sd-tasks-active').text(`${activeTasks.length} việc`);

        const $logs = $('#sd-logs').empty();
        if (tasks.length > 0) {
            tasks.forEach(function(t) {
                const d = t.ngay_trang_thai || t.ngay_tao || '';
                const dateFmt = d ? d.split('T')[0] : '';
                const statusStr = (t.trang_thai || '').replace(/_/g, ' ').toUpperCase();

                let stColor = '#555';
                if (t.trang_thai === 'dang_xu_ly') stColor = '#fd7e14';
                if (t.trang_thai === 'da_xu_ly') stColor = '#198754';
                if (t.trang_thai === 'cho_nghiem_thu') stColor = '#0dcaf0';

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

    $(document).on('click', '.btn-view-staff', function() {
        window.loadStaffDetail($(this).data('id'));
    });

    $(document).on('click', '.btn-suspend', async function() {
        const id = $(this).data('id');
        const result = await window.openAdminActionModal({
            type: 'danger',
            badge: 'Đình chỉ nhân viên',
            title: 'Xác nhận đình chỉ công tác',
            message: 'Nhân viên này sẽ không thể tiếp tục nhận hoặc xử lý công việc cho đến khi được gỡ đình chỉ.',
            requireReason: true,
            minLength: 3,
            label: 'Lý do đình chỉ',
            hint: 'Tối thiểu 3 ký tự. Nên ghi rõ nguyên nhân để tiện theo dõi nội bộ.',
            placeholder: 'Ví dụ: Vi phạm quy trình xử lý công việc.',
            confirmText: 'Đình chỉ nhân viên'
        });
        if (!result.confirmed) return;

        try {
            await window.apiRequest('PUT', `/admin/nguoi-dung/${id}/dinh-chi`, { ly_do: result.value });
            window.showToast({
                type: 'success',
                title: 'Đã đình chỉ nhân viên',
                message: 'Trạng thái nhân viên đã được cập nhật thành công.'
            });
            $('#staffDetailModal').fadeOut(100);
            const paging = getNhanVienPaging();
            window.loadNhanVien(paging.page, paging.limit);
        } catch (e) {
            window.showApiError(e);
        }
    });

    $(document).on('click', '.btn-unsuspend', async function() {
        const id = $(this).data('id');
        const result = await window.openAdminActionModal({
            type: 'success',
            badge: 'Gỡ đình chỉ',
            title: 'Khôi phục trạng thái làm việc',
            message: 'Nhân viên này sẽ được phép quay lại trạng thái sẵn sàng làm việc.',
            confirmText: 'Gỡ đình chỉ'
        });
        if (!result.confirmed) return;

        try {
            await window.apiRequest('PUT', `/admin/nguoi-dung/${id}/dinh-chi`);
            window.showToast({
                type: 'success',
                title: 'Đã gỡ đình chỉ',
                message: 'Nhân viên đã được khôi phục trạng thái làm việc.'
            });
            $('#staffDetailModal').fadeOut(100);
            const paging = getNhanVienPaging();
            window.loadNhanVien(paging.page, paging.limit);
        } catch (e) {
            window.showApiError(e);
        }
    });

    $(document)
        .off('input.staffFilter change.staffFilter', '#search-staff, #filter-staff-status')
        .on('input.staffFilter', '#search-staff', function() {
            clearTimeout(window.__staffFilterTimer);
            window.__staffFilterTimer = setTimeout(function() {
                const paging = getNhanVienPaging();
                window.loadNhanVien(1, paging.limit);
            }, 300);
        })
        .on('change.staffFilter', '#filter-staff-status', function() {
            const paging = getNhanVienPaging();
            window.loadNhanVien(1, paging.limit);
        });
})(window, jQuery);
