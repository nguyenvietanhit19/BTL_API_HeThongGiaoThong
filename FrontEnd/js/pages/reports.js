// FILE: js/pages/reports.js
(function(window, $) {
    'use strict';

    // 1. Tải danh sách theo trạng thái
    window.loadListByStatus = async function(status, containerSelector, page = 1, limit = 10) {
        try {
            const res = await window.apiRequest('GET', `/admin_get/dashboard?trang_thai=${encodeURIComponent(status)}&page=${page}&limit=${limit}`);
            const data = (res.list && res.list.data) ? res.list.data : [];
            // Nếu đang render bảng 'chờ duyệt' (cột khác so với các bảng chung), render thủ công
            if (containerSelector === '#table-body-cho-duyet' || status === 'cho_duyet') {
                const $tb = $(containerSelector);
                $tb.empty();
                if (!data.length) {
                    $tb.append('<tr><td colspan="5" class="text-center">Không có dữ liệu</td></tr>');
                    if (typeof window.renderPagination === 'function') {
                        window.renderPagination({
                            key: 'reports-' + status,
                            anchor: containerSelector,
                            currentPage: page,
                            pageSize: limit,
                            totalItems: (res.list && res.list.total) || 0,
                            onPageChange: function(nextPage, nextLimit) {
                                window.loadListByStatus(status, containerSelector, nextPage, nextLimit);
                            }
                        });
                    }
                    return;
                }

                function fmtDate(s) {
                    if (!s) return '';
                    const d = new Date(s);
                    if (isNaN(d.getTime())) return s.toString();
                    const pad = n => n < 10 ? '0' + n : n;
                    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                }

                data.forEach(function(item) {
                    const id = item.bao_cao_id || item.id || '';
                    const $tr = $('<tr/>');

                    const titleHtml = `<div class="report-summary"><strong>${(item.tieu_de||'')}</strong><div class="muted" style="font-size:12px;color:#666;">${(item.dia_chi||'')}</div></div>`;
                    $tr.append($('<td/>').html(titleHtml));
                    $tr.append($('<td/>').text(item.loai || ''));
                    $tr.append($('<td/>').text(item.nguoi_bao_cao || item.ho_ten || ''));
                    $tr.append($('<td/>').text(fmtDate(item.ngay_tao || item.ngay_tao)));

                    // Actions
                    const $actionTd = $('<td/>');
                    if (status === 'cho_duyet') {
                        $actionTd.html(`<button class="btn-action btn-approve" data-id="${id}">Duyệt</button> <button class="btn-action btn-reject" data-id="${id}">Từ chối</button>`);
                    } else {
                        $actionTd.html(`<button class="btn-action btn-view" data-id="${id}">Xem</button>`);
                    }
                    $tr.append($actionTd);
                    $tb.append($tr);
                });

                if (typeof window.renderPagination === 'function') {
                    window.renderPagination({
                        key: 'reports-' + status,
                        anchor: containerSelector,
                        currentPage: page,
                        pageSize: limit,
                        totalItems: (res.list && res.list.total) || 0,
                        onPageChange: function(nextPage, nextLimit) {
                            window.loadListByStatus(status, containerSelector, nextPage, nextLimit);
                        }
                    });
                }
                return;
            }

            // Default renderer for other lists
            window.renderReportRows($(containerSelector), data, function(item) {
                const id = item.bao_cao_id || item.id;

                if (status === 'cho_nghiem_thu') {
                    return `<button class="btn-action btn-accept" data-id="${id}">Đạt</button> 
                            <button class="btn-action btn-reject-nt" data-id="${id}">Không đạt</button>`;
                }
                return `<button class="btn-action btn-view" data-id="${id}">Xem</button>`;
            });
            if (typeof window.renderPagination === 'function') {
                window.renderPagination({
                    key: 'reports-' + status,
                    anchor: containerSelector,
                    currentPage: page,
                    pageSize: limit,
                    totalItems: (res.list && res.list.total) || 0,
                    onPageChange: function(nextPage, nextLimit) {
                        window.loadListByStatus(status, containerSelector, nextPage, nextLimit);
                    }
                });
            }
        } catch(e) { window.showApiError(e); }
    };

    // 2. Tải chi tiết một báo cáo
    window.loadReportDetail = async function(id) {
        try {
            const res = await window.apiRequest('GET', '/bao-cao/' + id);
            const info = res.data ? (res.data.thong_tin || res.data) : res;
            if (!info) { alert('Không tìm thấy báo cáo'); return; }
            
            const $main = $('.main-content');

            // Nếu trang hiện tại có khu vực detail (ví dụ #view-detail), sử dụng nó
            if ($main.find('#view-detail').length > 0 || $main.find('#bc-tieu-de').length > 0) {
                const $root = $main;
                $root.find('#bc-tieu-de').text(info.tieu_de || '');
                $root.find('#bc-dia-chi-time').text((info.dia_chi || '') + ' — ' + (info.ngay_tao || ''));
                $root.find('#bc-breadcrumb').text('Báo cáo #' + id + ' ' + (info.tieu_de||''));

                $root.find('#grid-anh-goc, #grid-anh-so-sanh').empty();
                const images = res.data ? (res.data.hinh_anh || []) : (res.hinh_anh || []);
                images.forEach(function(a) {
                    const $img = $(`<div class="img-placeholder" style="margin-bottom:12px;"><img src="${a.duong_dan_anh}" style="max-width:100%;height:auto;border-radius:8px;"></div>`);
                    if (a.loai_anh === 'bao_cao') $root.find('#grid-anh-goc').append($img); 
                    else $root.find('#grid-anh-so-sanh').append($img);
                });

                $root.find('#bc-timeline').empty(); 
                const timeline = res.data ? (res.data.lich_su || []) : (res.lich_su || []);
                timeline.forEach(function(t) {
                    $root.find('#bc-timeline').append(`<div class="timeline-item" style="margin-bottom:10px;"><div class="timeline-dot" style="width:8px;height:8px;background:#666;border-radius:50%;display:inline-block;margin-right:8px;"></div><div style="display:inline-block;vertical-align:top;"><strong>${t.ten_nguoi_doi || 'Hệ thống'}</strong><div style="color:#666;">${t.trang_thai_cu || 'Mới'} &rarr; ${t.trang_thai_moi || ''}</div><small style="color:#999;">${t.ngay_doi || ''}</small></div></div>`);
                });

                // Hiển thị khu vực detail nếu có
                if ($root.find('#view-list').length && $root.find('#view-detail').length) {
                    $root.find('#view-list').hide();
                    $root.find('#view-detail').show();
                }

            } else {
                // Tạo modal chi tiết (dùng chung) nếu chưa có
                if ($('#reportDetailModal').length === 0) {
                    const modalHtml = `
                    <div id="reportDetailModal" style="display:none;position:fixed;inset:0;z-index:1200;">
                        <div class="rd-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.5);"></div>
                        <div class="rd-content" style="position:relative;max-width:900px;margin:40px auto;background:#fff;border-radius:8px;padding:20px;overflow:auto;max-height:80vh;">
                            <button class="rd-close" style="position:absolute;right:12px;top:8px;border:none;background:none;font-size:24px;cursor:pointer;">&times;</button>
                            <h2 id="rd-bc-tieu-de"></h2>
                            <div id="rd-bc-dia-chi-time" style="color:#666;margin-bottom:8px;"></div>
                            <div id="rd-bc-breadcrumb" style="font-size:13px;color:#999;margin-bottom:12px;"></div>
                            <div style="display:flex;gap:12px;flex-wrap:wrap;">
                                <div id="rd-grid-anh-goc" style="flex:1 1 45%;"></div>
                                <div id="rd-grid-anh-so-sanh" style="flex:1 1 45%;"></div>
                            </div>
                            <hr />
                            <div id="rd-bc-timeline"></div>
                        </div>
                    </div>`;
                    $(document.body).append(modalHtml);

                    // đóng modal (gán handler trực tiếp cho phần tử vừa tạo)
                    $('#reportDetailModal .rd-close, #reportDetailModal .rd-overlay').on('click', function() {
                        $('#reportDetailModal').fadeOut(160, function() { $(this).remove(); });
                    });
                }

                // Điền nội dung vào modal
                $('#rd-bc-tieu-de').text(info.tieu_de || '');
                $('#rd-bc-dia-chi-time').text((info.dia_chi || '') + ' — ' + (info.ngay_tao || ''));
                $('#rd-bc-breadcrumb').text('Báo cáo #' + id + ' ' + (info.tieu_de||''));

                $('#rd-grid-anh-goc, #rd-grid-anh-so-sanh').empty();
                const images2 = res.data ? (res.data.hinh_anh || []) : (res.hinh_anh || []);
                images2.forEach(function(a) {
                    const $img = $(`<div class="img-placeholder" style="margin-bottom:12px;"><img src="${a.duong_dan_anh}" style="max-width:100%;height:auto;border-radius:8px;"></div>`);
                    if (a.loai_anh === 'bao_cao') $('#rd-grid-anh-goc').append($img); 
                    else $('#rd-grid-anh-so-sanh').append($img);
                });

                $('#rd-bc-timeline').empty(); 
                const timeline2 = res.data ? (res.data.lich_su || []) : (res.lich_su || []);
                timeline2.forEach(function(t) {
                    $('#rd-bc-timeline').append(`<div class="timeline-item" style="margin-bottom:10px;"><div class="timeline-dot" style="width:8px;height:8px;background:#666;border-radius:50%;display:inline-block;margin-right:8px;"></div><div style="display:inline-block;vertical-align:top;"><strong>${t.ten_nguoi_doi || 'Hệ thống'}</strong><div style="color:#666;">${t.trang_thai_cu || 'Mới'} &rarr; ${t.trang_thai_moi || ''}</div><small style="color:#999;">${t.ngay_doi || ''}</small></div></div>`);
                });

                // Hiện modal chi tiết
                $('#reportDetailModal').fadeIn(120);
            }
        } catch(e) { window.showApiError(e); }
    };

    // 3. Xử lý sự kiện các nút bấm (Sử dụng Event Delegation)
    $(document).on('click', '.btn-approve', function() {
        const id = $(this).data('id');
        if (!confirm('Bạn có chắc chắn muốn duyệt báo cáo này?')) return;
        window.apiRequest('PUT', `/admin/bao-cao/${id}/duyet`)
            .then(() => {
                if (window.refreshSidebarCounts) window.refreshSidebarCounts();
                window.routeToPage(window.location.pathname);
            }).catch(window.showApiError);
    });

    $(document).on('click', '.btn-reject', function() {
        const id = $(this).data('id');
        if (!confirm('Từ chối báo cáo này?')) return;
        window.apiRequest('PUT', `/admin/bao-cao/${id}/tu-choi`)
            .then(() => {
                if (window.refreshSidebarCounts) window.refreshSidebarCounts();
                window.routeToPage(window.location.pathname);
            }).catch(window.showApiError);
    });

    $(document).on('click', '.btn-accept', function() {
        const id = $(this).data('id');
        if (!confirm('Nghiệm thu thành công? Báo cáo sẽ đóng.')) return;
        window.apiRequest('PUT', `/admin/bao-cao/${id}/nghiem-thu`, { ket_qua: 'dat' })
            .then(() => {
                if (window.refreshSidebarCounts) window.refreshSidebarCounts();
                window.routeToPage(window.location.pathname);
            }).catch(window.showApiError);
    });

    $(document).on('click', '.btn-reject-nt', function() {
        const id = $(this).data('id');
        if (!confirm('Nghiệm thu không đạt? Nhân viên sẽ phải làm lại.')) return;
        window.apiRequest('PUT', `/admin/bao-cao/${id}/nghiem-thu`, { ket_qua: 'khong_dat' })
            .then(() => {
                if (window.refreshSidebarCounts) window.refreshSidebarCounts();
                window.routeToPage(window.location.pathname);
            }).catch(window.showApiError);
    });

    $(document).on('click', '.btn-view', function() {
        window.loadReportDetail($(this).data('id'));
    });

})(window, jQuery);
