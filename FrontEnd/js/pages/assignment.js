// FILE: js/pages/assignment.js
(function(window, $){
    'use strict';

    window.loadPhanCong = async function(page = 1, limit = 10, filters = {}) {
        try {
            // Lấy báo cáo đã duyệt cần phân công
            const res = await window.apiRequest('GET', `/admin_get/dashboard?trang_thai=da_duyet&page=${page}&limit=${limit}`);
            let reports = (res.list && res.list.data) ? res.list.data : [];
            let total = (res.list && (typeof res.list.total === 'number')) ? res.list.total : 0;

            // Lấy danh sách nhân viên
            const userRes = await window.apiRequest('GET', '/admin/nguoi-dung');
            const users = userRes.danh_sach || userRes.data || userRes || [];
            const staff = users.filter(u => (u.vai_tro === 'nhan_vien' || u.vai_tro === 'nhân_vien') && !u.bi_dinh_chi);

            const $tb = $('#table-body-phan-cong'); $tb.empty();

            // Populate event filter select with events found in returned data
            const $filter = $('#filter-event');
            if ($filter.length) {
                const prev = $filter.val() || '';
                $filter.empty();
                $filter.append('<option value="">Tất cả sự kiện</option>');
                const evSet = new Set();
                (res.list && res.list.data ? res.list.data : []).forEach(rr => {
                    const ev = (rr.loai_su_co || rr.loai || '').toString();
                    if (ev) evSet.add(ev);
                });
                Array.from(evSet).sort().forEach(ev => $filter.append(`<option value="${ev}">${ev}</option>`));
                if (prev) $filter.val(prev);
            }

            // If client-side filtering by event requested, fetch all and filter locally so pagination reflects filtered count
            if (filters && filters.event && total > 0) {
                const allRes = await window.apiRequest('GET', `/admin_get/dashboard?trang_thai=da_duyet&page=1&limit=${Math.max(total, 1)}`);
                let allReports = (allRes.list && allRes.list.data) ? allRes.list.data : [];
                allReports = allReports.filter(item => ((item.loai_su_co || item.loai || '') + '').toLowerCase() === (filters.event + '').toLowerCase());
                total = allReports.length;
                reports = allReports.slice((page - 1) * limit, page * limit);
            }

            if (!reports.length) {
                $tb.append('<tr><td colspan="4" class="text-center">Không có báo cáo nào chờ phân công</td></tr>');
                if (typeof window.renderPagination === 'function') {
                    window.renderPagination({
                        key: 'assignment',
                        anchor: '#table-body-phan-cong',
                        currentPage: page,
                        pageSize: limit,
                        totalItems: total || 0,
                        onPageChange: function(nextPage, nextLimit) {
                            window.loadPhanCong(nextPage, nextLimit, filters);
                        }
                    });
                }
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
            if (typeof window.renderPagination === 'function') {
                window.renderPagination({
                    key: 'assignment',
                    anchor: '#table-body-phan-cong',
                    currentPage: page,
                    pageSize: limit,
                    totalItems: total || ((res.list && res.list.total) || 0),
                    onPageChange: function(nextPage, nextLimit) {
                        window.loadPhanCong(nextPage, nextLimit, filters);
                    }
                });
            }
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

    // Event filter change handler
    $(document).off('change', '#filter-event').on('change', '#filter-event', function() {
        const key = 'assignment';
        const pageSize = window.getPaginationPageSize ? window.getPaginationPageSize(key, 10) : 10;
        const ev = ($('#filter-event').val && $('#filter-event').val()) || '';
        window.loadPhanCong(1, pageSize, { event: ev });
    });

})(window, jQuery);
