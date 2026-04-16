(function(window, $) {
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

    window.loadPhanCong = async function(page = 1, limit = 10) {
        try {
            const res = await window.apiRequest('GET', '/admin_get/dashboard?trang_thai=da_duyet&page=1&limit=1000');
            let reports = res && res.list && Array.isArray(res.list.data) ? res.list.data : [];
            reports = reports.filter(function(report) {
                return !report.nhan_vien_phu_trach && !report.nhan_vien_id && !report.nhan_vien;
            });

            const userRes = await window.apiRequest('GET', '/admin/nguoi-dung');
            const users = userRes.danh_sach || userRes.data || userRes || [];
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

            if (!pagination.data.length && pagination.total > 0 && page > 1) {
                return window.loadPhanCong(page - 1, limit);
            }

            const $tbody = $('#table-body-phan-cong');
            $tbody.empty();

            if (!reports.length) {
                $tbody.append('<tr><td colspan="5" class="text-center" style="padding:20px;">Không có báo cáo nào chờ phân công</td></tr>');
                if (typeof window.renderPagination === 'function') {
                    window.renderPagination({
                        key: 'assignment',
                        anchor: '#table-body-phan-cong',
                        currentPage: 1,
                        pageSize: limit,
                        totalItems: 0,
                        onPageChange: function(nextPage, nextLimit) {
                            window.loadPhanCong(nextPage, nextLimit);
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
                    currentPage: pagination.currentPage || page,
                    pageSize: pagination.pageSize || limit,
                    totalItems: pagination.total,
                    onPageChange: function(nextPage, nextLimit) {
                        window.loadPhanCong(nextPage, nextLimit);
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
})(window, jQuery);
