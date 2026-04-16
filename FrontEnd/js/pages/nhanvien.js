// FILE: js/pages/nhanvien.js
(function(window, $){
    'use strict';

    window.loadNhanVien = async function() {
        try {
            const res = await window.apiRequest('GET', '/admin/nguoi-dung');
            const users = res.danh_sach || res.data || res || [];
            
            // Lọc chỉ lấy nhân viên
            const staff = users.filter(u => (u.vai_tro === 'nhan_vien' || u.vai_tro === 'nhân_vien') && !u.bi_dinh_chi);

            // Giả định logic thống kê (bạn có thể sửa theo API thật nếu backend trả về khác)
            $('#stat-total-staff').text(staff.length || 0);
            $('#stat-available').text(staff.filter(s => !s.dang_hoat_dong).length || 0);
            $('#stat-busy').text(staff.filter(s => s.dang_hoat_dong).length || 0);

            const $tb = $('#table-body-nhan-vien'); 
            $tb.empty();
            
            if (!staff.length) {
                $tb.append('<tr><td colspan="4" class="text-center">Không có nhân viên nào</td></tr>');
                return;
            }

            staff.forEach(function(s) {
                const id = s.nguoi_dung_id || s.id || '';
                const avatarChar = s.ho_ten ? s.ho_ten.charAt(0).toUpperCase() : '?';
                const statusText = s.dang_hoat_dong ? 'Đang làm việc' : 'Sẵn sàng';
                const statusColor = s.dang_hoat_dong ? 'orange' : 'green';

                const $tr = $('<tr/>');
                $tr.append($('<td/>').html(`<div class="user-info"><div class="avatar">${avatarChar}</div><div class="name-details"><strong>${s.ho_ten||''}</strong><span>${s.email||''}</span></div></div>`));
                $tr.append($('<td/>').text(s.so_cong_viec || s.viec_dang_lam || '0'));
                $tr.append($('<td/>').html(`<span class="badge ${statusColor}">${statusText}</span>`));
                $tr.append($('<td/>').html(`<button class="btn-action btn-view-user" data-id="${id}">Chi tiết</button>`));
                
                $tb.append($tr);
            });

        } catch (err) { window.showApiError(err); }
    };
})(window, jQuery);