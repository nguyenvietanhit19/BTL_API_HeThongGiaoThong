// FILE: js/pages/assignment.js
(function(window, $){
    'use strict';

    window.loadPhanCong = async function() {
        try {
            // Lấy báo cáo đã duyệt cần phân công
            const res = await window.apiRequest('GET', '/admin_get/dashboard?trang_thai=da_duyet&limit=100');
            const reports = (res.list && res.list.data) ? res.list.data : [];

            // Lấy danh sách nhân viên
            const userRes = await window.apiRequest('GET', '/admin/nguoi-dung');
            const users = userRes.danh_sach || userRes.data || userRes || [];
            const staff = users.filter(u => (u.vai_tro === 'nhan_vien' || u.vai_tro === 'nhân_vien') && !u.bi_dinh_chi);

            const $tb = $('#table-body-phan-cong'); $tb.empty();
            if (!reports.length) {
                $tb.append('<tr><td colspan="4" class="text-center">Không có báo cáo nào chờ phân công</td></tr>');
                return;
            }

            reports.forEach(function(r) {
                const id = r.bao_cao_id || r.id || '';
                const $tr = $('<tr/>');
                $tr.append($('<td/>').text(r.tieu_de || ''));
                $tr.append($('<td/>').text(r.loai_su_co || r.loai || ''));

                const $sel = $(`<select class="assign-select" data-id="${id}"></select>`);
                $sel.append('<option value="">Chọn nhân viên</option>');
                staff.forEach(s => {
                    const uid = s.nguoi_dung_id || s.id || '';
                    const label = (s.ho_ten ? s.ho_ten : 'Không tên') + (uid ? (' - Mã NV ' + uid) : '');
                    $sel.append(`<option value="${uid}">${label}</option>`);
                });
                $tr.append($('<td/>').append($sel));

                $tr.append($('<td/>').html(`<button class="btn-action btn-assign-now" data-id="${id}">Giao việc</button>`));
                $tb.append($tr);
            });
        } catch (err) { window.showApiError(err); }
    };

    $(document).off('click', '.btn-assign-now').on('click', '.btn-assign-now', function() {
            const id = $(this).data('id');
            const nhanVienId = $(this).closest('tr').find('select.assign-select').val();
            if (!nhanVienId) return alert('Vui lòng chọn nhân viên trước khi giao việc!');

            const $btn = $(this);
            $btn.prop('disabled', true);

            window.apiRequest('POST', `/admin/bao-cao/${id}/phan-cong`, {
                nhan_vien_id: parseInt(nhanVienId, 10)
            })
            .then(() => {
                if (window.refreshSidebarCounts) window.refreshSidebarCounts();
                window.routeToPage(window.location.pathname);
            })
            .catch(window.showApiError)
            .finally(() => $btn.prop('disabled', false));
    });

})(window, jQuery);