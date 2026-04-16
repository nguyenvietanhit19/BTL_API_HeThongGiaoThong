// FILE: js/pages/nhanvien.js
(function (window, $) {
    'use strict';

    window.loadNhanVien = async function (page = 1, limit = 10) {
        try {
            const res = await window.apiRequest('GET', '/admin/nguoi-dung');
            const users = res.danh_sach || res.data || res || [];
            const pagination = typeof window.paginateArray === 'function'
                ? window.paginateArray([], page, limit)
                : { data: [], total: 0, currentPage: page, pageSize: limit };

            // Lọc chỉ lấy nhân viên
            const staff = users.filter(u => (u.vai_tro === 'nhan_vien' || u.vai_tro === 'nhân_vien') && !u.bi_dinh_chi);

            // Giả định logic thống kê (bạn có thể sửa theo API thật nếu backend trả về khác)
            pagination.total = staff.length;
            pagination.pageSize = limit;
            pagination.currentPage = page;
            pagination.data = staff.slice((page - 1) * limit, page * limit);
            const visibleStaff = pagination.data || [];
            $('#stat-total-staff').text(staff.length || 0);
            $('#stat-available').text(staff.filter(s => !s.dang_hoat_dong).length || 0);
            $('#stat-busy').text(staff.filter(s => s.dang_hoat_dong).length || 0);

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

            visibleStaff.forEach(function (s) {
                const id = s.nguoi_dung_id || s.id || '';
                const avatarChar = s.ho_ten ? s.ho_ten.charAt(0).toUpperCase() : '?';
                const statusText = s.dang_hoat_dong ? 'Đang làm việc' : 'Sẵn sàng';
                const statusColor = s.dang_hoat_dong ? 'orange' : 'green';

                const $tr = $('<tr/>');
                // 1) HỌ TÊN
                $tr.append($('<td/>').html(`<strong>${s.ho_ten || ''}</strong>`));
                // 2) EMAIL LIÊN HỆ
                $tr.append($('<td/>').text(s.email || ''));
                // 3) VIỆC ĐANG XỬ LÝ
                $tr.append($('<td/>').text(s.so_cong_viec || s.viec_dang_lam || '0'));
                // 4) TRẠNG THÁI
                $tr.append($('<td/>').html(`<span class="badge ${statusColor}">${statusText}</span>`));
                // 5) HÀNH ĐỘNG
                $tr.append($('<td/>').html(`<button class="btn-action btn-view-user" data-id="${id}">Chi tiết</button>`));

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
})(window, jQuery);
