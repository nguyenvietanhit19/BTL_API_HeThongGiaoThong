// FILE: js/pages/assignment.js
(function(window, $){
    'use strict';

    function getTitleHtml(item) {
        return `
            <div class="report-summary" style="display:flex;flex-direction:column;">
                <strong style="color:#2b3035;font-size:15px;margin-bottom:4px;">${item.tieu_de || 'Không có tiêu đề'}</strong>
                <span class="muted" style="font-size:13px;color:#6c757d;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${item.dia_chi || 'Chưa cập nhật địa chỉ'}</span>
            </div>
        `;
    }

    function getAssignmentPaging() {
        return {
            page: window.getPaginationPage ? window.getPaginationPage('assignment', 1) : 1,
            limit: window.getPaginationPageSize ? window.getPaginationPageSize('assignment', 5) : 5
        };
    }
    window.loadPhanCong = async function(page = 1, limit = 10, filters = {}) {
        try {
            // Lấy báo cáo đã duyệt cần phân công
            const res = await window.apiRequest('GET', `/admin_get/dashboard?trang_thai=da_duyet&page=${page}&limit=${limit}`);
            let reports = (res.list && res.list.data) ? res.list.data : [];
            let total = (res.list && (typeof res.list.total === 'number')) ? res.list.total : 0;
            const res = await window.apiRequest('GET', '/admin_get/dashboard?trang_thai=da_duyet&page=1&limit=1000');
            });

            // Lấy danh sách nhân viên
             const userRes = await window.apiRequest('GET', '/admin/nguoi-dung');
            const users = userRes.danh_sach || userRes.data || userRes || [];
            const staff = users.filter(u => (u.vai_tro === 'nhan_vien' || u.vai_tro === 'nhân_vien') && !u.bi_dinh_chi);

            const staff = users.filter(function(user) {
                return (user.vai_tro === 'nhan_vien' || user.vai_tro === 'nhân_vien') && !user.bi_dinh_chi;
            });

            const pagination = typeof window.paginateArray === 'function'
                ? window.paginateArray(reports, page, limit)
                : {
                    total: reports.length,
                    currentPage: page,
                    pageSize: limit,
                    data: reports.slice((page - 1) * limit, page * limit)
                };

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
                $tbody.append('<tr><td colspan="5" class="text-center" style="padding:20px;">Không có báo cáo nào chờ phân công</td></tr>');
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

            pagination.data.forEach(function(report) {
                const id = report.bao_cao_id || report.id || '';
                const loai = report.loai_su_co || report.loai || 'Chưa rõ';
                let selectHtml = `<select class="assign-select" data-id="${id}" style="padding:6px;border:1px solid #ccc;border-radius:4px;width:100%;"><option value="">-- Chọn nhân viên --</option>`;

                staff.forEach(function(member) {
                    const uid = member.nguoi_dung_id || member.id || '';
                    const label = `${member.ho_ten || 'Không tên'} (ID: ${uid})`;
                    selectHtml += `<option value="${uid}">${label}</option>`;
                });

                selectHtml += '</select>';

                const $tr = $('<tr/>');
                $tr.append($('<td/>').html(`<strong>#${id}</strong>`));
                $tr.append($('<td/>').html(getTitleHtml(report)));
                $tr.append($('<td/>').html(`<span style="background:#e9ecef;color:#495057;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600;">${loai}</span>`));
                $tr.append($('<td/>').html(selectHtml));
                $tr.append($('<td/>').html('<button class="btn-action primary btn-assign-now" data-id="' + id + '" style="background:#0d6efd;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;">Giao việc</button>'));
                $tbody.append($tr);
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
        } catch (err) {
            window.showApiError(err);
        }
    };

    $(document).off('click', '.btn-assign-now').on('click', '.btn-assign-now', function() {
        const id = $(this).data('id');
        const nhanVienId = $(this).closest('tr').find('select.assign-select').val();

        if (!nhanVienId) {
            alert('Vui lòng chọn một nhân viên trước khi giao việc.');
            return;
        }

        const $button = $(this);
        $button.prop('disabled', true).text('Đang giao...');

        window.apiRequest('POST', `/admin/bao-cao/${id}/phan-cong`, {
            nhan_vien_id: parseInt(nhanVienId, 10)
        }).then(function() {
            if (window.refreshSidebarCounts) window.refreshSidebarCounts();
            const paging = getAssignmentPaging();
            window.loadPhanCong(paging.page, paging.limit);
            alert('Phân công nhân viên thành công.');
        }).catch(function(err) {
            $button.prop('disabled', false).text('Giao việc');
            window.showApiError(err);
        });
    });

    // Event filter change handler
    $(document).off('change', '#filter-event').on('change', '#filter-event', function() {
        const key = 'assignment';
        const pageSize = window.getPaginationPageSize ? window.getPaginationPageSize(key, 10) : 10;
        const ev = ($('#filter-event').val && $('#filter-event').val()) || '';
        window.loadPhanCong(1, pageSize, { event: ev });
    });

})(window, jQuery);
