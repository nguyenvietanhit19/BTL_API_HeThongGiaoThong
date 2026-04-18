(function(window, $) {
    'use strict';

    const REPORT_PAGE_CONFIG = {
        'cho-duyet.html': { status: 'cho_duyet', container: '#table-body-cho-duyet' },
        'da-duyet.html': { status: 'da_duyet', container: '#table-body-da-duyet' },
        'tu-choi.html': { status: 'tu_choi', container: '#table-body-tu-choi' },
        'dang-xu-ly.html': { status: 'dang_xu_ly', container: '#table-body-dang-xu-ly' },
        'cho-nghiem-thu.html': { status: 'cho_nghiem_thu', container: '#table-body-nghiem-thu' },
        'da-xu-ly.html': { status: 'da_xu_ly', container: '#table-body-da-xu-ly' },
        'da-phan-cong.html': { status: 'da_phan_cong', container: '#table-body-da-phan-cong' }
    };

    const reportFilters = {};
    let reportFilterTimer = null;

    function getTitleHtml(item) {
        return `
            <div class="report-summary" style="display:flex;flex-direction:column;">
                <strong style="color:#2b3035;font-size:15px;margin-bottom:4px;">${item.tieu_de || 'Không có tiêu đề'}</strong>
                <span class="muted" style="font-size:13px;color:#6c757d;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${item.dia_chi || 'Chưa cập nhật địa chỉ'}</span>
            </div>
        `;
    }

    function getPaginationKey(status) {
        return 'reports-' + status;
    }

    function getCurrentPageConfig() {
        const page = window.location.pathname.split('/').pop();
        return REPORT_PAGE_CONFIG[page] || null;
    }

    function getFilterState(status) {
        if (!reportFilters[status]) {
            reportFilters[status] = {
                keyword: '',
                loai_su_co_id: '',
                ngay_loc: ''
            };
        }
        return reportFilters[status];
    }

    function syncFilterInputs(status) {
        const state = getFilterState(status);
        $('.filter-search').val(state.keyword || '');
        $('.filter-category').val(state.loai_su_co_id || '');
        $('.filter-date').val(state.ngay_loc || '');
    }

    async function loadLoaiSuCoOptions() {
        const $select = $('.filter-category');
        if (!$select.length || $select.data('loaded')) return;

        try {
            const list = await window.apiRequest('GET', '/api/Reports/loai-su-co');
            const items = Array.isArray(list) ? list : [];

            items.forEach(function(item) {
                const id = item.id || item.loai_su_co_id || '';
                const ten = item.ten || '';
                if (!id || !ten) return;
                if ($select.find(`option[value="${id}"]`).length) return;
                $select.append(`<option value="${id}">${ten}</option>`);
            });

            $select.data('loaded', true);
        } catch (err) {
            console.warn('Không thể tải danh mục loại sự cố', err);
        }
    }

    function bindFilterEvents(status, containerSelector) {
        const state = getFilterState(status);
        syncFilterInputs(status);

        const triggerReload = function() {
            const limit = window.getPaginationPageSize ? window.getPaginationPageSize(getPaginationKey(status), 5) : 5;
            window.loadListByStatus(status, containerSelector, 1, limit);
        };

        $('.filter-search')
            .off('.reportFilter')
            .on('input.reportFilter', function() {
                state.keyword = ($(this).val() || '').trim();
                clearTimeout(reportFilterTimer);
                reportFilterTimer = setTimeout(triggerReload, 300);
            });

        $('.filter-category')
            .off('.reportFilter')
            .on('change.reportFilter', function() {
                state.loai_su_co_id = ($(this).val() || '').trim();
                triggerReload();
            });

        $('.filter-date')
            .off('.reportFilter')
            .on('change.reportFilter', function() {
                state.ngay_loc = ($(this).val() || '').trim();
                triggerReload();
            });
    }

    function getColumnCount(status) {
        if (status === 'cho_duyet') return 6;
        if (status === 'cho_nghiem_thu' || status === 'tu_choi' || status === 'da_xu_ly' || status === 'da_duyet') return 5;
        return 6;
    }

    function getStatusPaging(status) {
        return {
            page: window.getPaginationPage ? window.getPaginationPage(getPaginationKey(status), 1) : 1,
            limit: window.getPaginationPageSize ? window.getPaginationPageSize(getPaginationKey(status), 5) : 5
        };
    }

    function reloadStatusList(status, containerSelector) {
        const paging = getStatusPaging(status);
        return window.loadListByStatus(status, containerSelector, paging.page, paging.limit);
    }

    function fmtDate(value) {
        if (window.formatToTZ) return window.formatToTZ(value);
        if (!value) return '';
        const date = new Date(value);
        if (isNaN(date.getTime())) return String(value);
        const pad = function(num) { return num < 10 ? '0' + num : String(num); };
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function renderEmptyState($tbody, status) {
        $tbody.empty().append(`<tr><td colspan="${getColumnCount(status)}" class="text-center" style="padding:20px;">Không có dữ liệu báo cáo</td></tr>`);
    }

    function escapeHtml(value) {
        return $('<div/>').text(value || '').html();
    }

    function getStatusLabel(status) {
        const labels = {
            cho_duyet: 'Chờ duyệt',
            da_duyet: 'Đã duyệt',
            tu_choi: 'Từ chối',
            dang_xu_ly: 'Đang xử lý',
            cho_nghiem_thu: 'Chờ nghiệm thu',
            da_xu_ly: 'Đã xử lý',
            da_phan_cong: 'Đã phân công'
        };
        return labels[status] || String(status || '').replace(/_/g, ' ');
    }

    function buildThumbHtml(src) {
        return `
            <div class="report-thumb">
                <img src="${src}" data-src="${src}" class="report-thumb-img" style="width:100px;height:100px;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid #eee;">
            </div>
        `;
    }

    async function refreshAfterReportAction(status, containerSelector) {
        if (window.refreshSidebarCounts) window.refreshSidebarCounts();
        await reloadStatusList(status, containerSelector);
    }

    window.loadListByStatus = async function(status, containerSelector, page, limit) {
        page = page || 1;
        limit = limit || 10;

        try {
            const state = getFilterState(status);
            loadLoaiSuCoOptions();
            bindFilterEvents(status, containerSelector);

            const query = new URLSearchParams({
                trang_thai: status,
                page: page,
                limit: limit
            });

            if (state.keyword) query.set('keyword', state.keyword);
            if (state.loai_su_co_id) query.set('loai_su_co_id', state.loai_su_co_id);
            if (state.ngay_loc) query.set('ngay_loc', state.ngay_loc);

            const res = await window.apiRequest('GET', `/admin_get/dashboard?${query.toString()}`);
            const list = res && res.list ? res.list : {};
            const data = Array.isArray(list.data) ? list.data : [];
            const total = typeof list.total === 'number' ? list.total : data.length;
            const $tbody = $(containerSelector);

            if (!data.length && total > 0 && page > 1) {
                return window.loadListByStatus(status, containerSelector, page - 1, limit);
            }

            if (!data.length) {
                renderEmptyState($tbody, status);
            } else {
                $tbody.empty();

                data.forEach(function(item) {
                    const id = item.bao_cao_id || item.id || '';
                    const loai = item.loai || item.loai_su_co || 'Chưa rõ';
                    const nhanVien = item.nhan_vien_phu_trach || item.nhan_vien || 'Chưa có';
                    const $tr = $('<tr/>');

                    if (status === 'cho_duyet') {
                        $tr.append($('<td/>').html(`<strong>#${id}</strong>`));
                        $tr.append($('<td/>').html(getTitleHtml(item)));
                        $tr.append($('<td/>').html(`<span style="background:#e9ecef;color:#495057;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600;">${loai}</span>`));
                        $tr.append($('<td/>').text(item.nguoi_bao_cao || item.ho_ten || ''));
                        $tr.append($('<td/>').text(fmtDate(item.ngay_tao)));
                        $tr.append($('<td/>').html(`
                            <button class="btn-action btn-approve" data-id="${id}">Duyệt</button>
                            <button class="btn-action btn-reject" data-id="${id}">Từ chối</button>
                            <button class="btn-action btn-view" data-id="${id}">Xem</button>
                        `));
                    } else if (status === 'cho_nghiem_thu') {
                        $tr.append($('<td/>').html(`<strong>#${id}</strong>`));
                        $tr.append($('<td/>').html(getTitleHtml(item)));
                        $tr.append($('<td/>').text(nhanVien || 'Chưa rõ'));
                        $tr.append($('<td/>').text(fmtDate(item.ngay_trang_thai || item.ngay_tao)));
                        $tr.append($('<td/>').html(`
                            <button class="btn-action btn-accept" data-id="${id}">Duyệt đạt</button>
                            <button class="btn-action btn-reject-nt" data-id="${id}">Không đạt</button>
                            <button class="btn-action btn-view" data-id="${id}">Xem</button>
                        `));
                    } else if (status === 'tu_choi') {
                        $tr.append($('<td/>').html(`<strong>#${id}</strong>`));
                        $tr.append($('<td/>').html(getTitleHtml(item)));
                        $tr.append($('<td/>').text(item.ghi_chu_trang_thai || 'Không có lý do'));
                        $tr.append($('<td/>').text(fmtDate(item.ngay_trang_thai || item.ngay_tao)));
                        $tr.append($('<td/>').html(`<button class="btn-action btn-view" data-id="${id}">Xem</button>`));
                    } else if (status === 'da_xu_ly') {
                        $tr.append($('<td/>').html(`<strong>#${id}</strong>`));
                        $tr.append($('<td/>').html(getTitleHtml(item)));
                        $tr.append($('<td/>').text(nhanVien || 'Không rõ'));
                        $tr.append($('<td/>').text(fmtDate(item.ngay_trang_thai || item.ngay_tao)));
                        $tr.append($('<td/>').html(`<button class="btn-action btn-view" data-id="${id}">Xem</button>`));
                    } else if (status === 'da_duyet') {
                        $tr.append($('<td/>').html(`<strong>#${id}</strong>`));
                        $tr.append($('<td/>').html(getTitleHtml(item)));
                        $tr.append($('<td/>').html(`<span style="background:#e9ecef;color:#495057;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600;">${loai}</span>`));
                        $tr.append($('<td/>').text(fmtDate(item.ngay_trang_thai || item.ngay_tao)));
                        $tr.append($('<td/>').html(`<button class="btn-action btn-view" data-id="${id}">Xem</button>`));
                    } else {
                        $tr.append($('<td/>').html(`<strong>#${id}</strong>`));
                        $tr.append($('<td/>').html(getTitleHtml(item)));
                        $tr.append($('<td/>').text(nhanVien));
                        $tr.append($('<td/>').text(fmtDate(item.ngay_trang_thai || item.ngay_tao)));
                        $tr.append($('<td/>').html(`<span class="badge" style="background:#f8f9fa;border:1px solid #ddd;color:#333;">${(item.trang_thai || '').replace(/_/g, ' ').toUpperCase()}</span>`));
                        $tr.append($('<td/>').html(`<button class="btn-action btn-view" data-id="${id}">Xem</button>`));
                    }

                    $tbody.append($tr);
                });
            }

            if (typeof window.renderPagination === 'function') {
                window.renderPagination({
                    key: getPaginationKey(status),
                    anchor: containerSelector,
                    currentPage: page,
                    pageSize: limit,
                    totalItems: total,
                    onPageChange: function(nextPage, nextLimit) {
                        window.loadListByStatus(status, containerSelector, nextPage, nextLimit);
                    }
                });
            }
        } catch (err) {
            window.showApiError(err);
        }
    };

    $(function() {
        const pageConfig = getCurrentPageConfig();
        if (!pageConfig) return;
        loadLoaiSuCoOptions();
        bindFilterEvents(pageConfig.status, pageConfig.container);
    });

    window.loadReportDetail = async function(id) {
        try {
            const res = await window.apiRequest('GET', '/bao-cao/' + id);
            const payload = res && res.data ? res.data : {};
            const info = payload.thong_tin || res;
            if (!info) {
                window.showToast({ type: 'error', title: 'Không tìm thấy báo cáo', message: 'Không tải được dữ liệu chi tiết của báo cáo #' + id + '.' });
                return;
            }

            const tenNguoiBaoCao = info.nguoi_bao_cao || info.ten_nguoi_gui || info.ten_nguoi_dung || info.ho_ten || 'Khách / Ẩn danh';

            if ($('#reportDetailModal').length === 0) {
                $(document.body).append(`
                    <div id="reportDetailModal" style="display:none;position:fixed;inset:0;z-index:9999;">
                        <div class="rd-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);"></div>
                        <div class="rd-content" style="position:relative;max-width:900px;margin:30px auto;background:#fff;border-radius:12px;padding:25px;max-height:90vh;overflow-y:auto;box-shadow:0 10px 30px rgba(0,0,0,0.2);">
                            <button class="rd-close" style="position:absolute;right:15px;top:15px;border:none;background:none;font-size:28px;cursor:pointer;color:#888;">&times;</button>
                            <div class="breadcrumb" style="margin-bottom:10px;color:#888;font-size:13px;">Chi tiết báo cáo &rsaquo; <strong id="rd-id"></strong></div>
                            <h2 id="rd-tieu-de" style="margin-top:0;color:#333;"></h2>
                            <p id="rd-dia-chi" style="color:#666;font-size:14px;margin-bottom:20px;"></p>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:25px;">
                                <div style="background:#f9f9f9;padding:15px;border-radius:8px;">
                                    <h4 style="margin:0 0 10px 0;color:#555;">THÔNG TIN CHUNG</h4>
                                    <p><strong>Loại sự cố:</strong> <span id="rd-loai"></span></p>
                                    <p><strong>Người báo cáo:</strong> <span id="rd-nguoi-gui"></span></p>
                                    <p><strong>Nhân viên xử lý:</strong> <span id="rd-nhan-vien"></span></p>
                                    <p><strong>Trạng thái:</strong> <span id="rd-trang-thai" class="badge"></span></p>
                                </div>
                                <div style="background:#f9f9f9;padding:15px;border-radius:8px;">
                                    <h4 style="margin:0 0 10px 0;color:#555;">MÔ TẢ NỘI DUNG</h4>
                                    <div id="rd-mo-ta" style="font-size:14px;line-height:1.5;color:#444;"></div>
                                </div>
                            </div>
                            <div style="display:flex;justify-content:flex-end;margin:-4px 0 20px;">
                                <button type="button" id="rd-chi-duong" style="border:none;background:#2563eb;color:#fff;padding:10px 16px;border-radius:8px;font-weight:700;cursor:pointer;">
                                    Chỉ đường
                                </button>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
                                <div class="image-section">
                                    <h4 style="border-left:4px solid #007bff;padding-left:10px;color:#007bff;">ẢNH HIỆN TRƯỜNG</h4>
                                    <div id="rd-grid-anh-goc" class="img-grid" style="display:flex;gap:10px;flex-wrap:wrap;min-height:100px;background:#fcfcfc;border:1px dashed #ddd;border-radius:8px;padding:10px;"></div>
                                </div>
                                <div class="image-section">
                                    <h4 style="border-left:4px solid #28a745;padding-left:10px;color:#28a745;">ẢNH HOÀN THÀNH</h4>
                                    <div id="rd-grid-anh-xuly" class="img-grid" style="display:flex;gap:10px;flex-wrap:wrap;min-height:100px;background:#fcfcfc;border:1px dashed #ddd;border-radius:8px;padding:10px;"></div>
                                </div>
                            </div>
                            <hr style="border:none;border-top:1px solid #eee;margin:25px 0;">
                            <h4 style="color:#555;">LỊCH SỬ TRẠNG THÁI</h4>
                            <div id="rd-timeline"></div>
                        </div>
                    </div>
                `);
            }

            $('#reportDetailModal .rd-close, #reportDetailModal .rd-overlay').off('click').on('click', function() {
                $('#reportDetailModal').fadeOut(150);
            });

            const $modal = $('#reportDetailModal');
            $modal.find('#rd-id').text('#' + id);
            $modal.find('#rd-tieu-de').text(info.tieu_de || 'Không có tiêu đề');
            $modal.find('#rd-dia-chi').text(info.dia_chi || 'Không rõ địa chỉ');
            $modal.find('#rd-loai').text(info.loai_su_co || info.loai || 'Chưa phân loại');
            $modal.find('#rd-nguoi-gui').text(tenNguoiBaoCao);
            $modal.find('#rd-nhan-vien').text(info.nhan_vien_phu_trach || 'Chưa có nhân viên');
            $modal.find('#rd-mo-ta').text(info.mo_ta || 'Không có mô tả chi tiết');
            $modal.find('#rd-trang-thai')
                .text(getStatusLabel(info.trang_thai || 'cho_duyet'))
                .attr('class', 'badge ' + (info.trang_thai || 'cho_duyet'));

            const lat = Number(info.vi_do);
            const lng = Number(info.kinh_do);
            const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng);

            $modal.find('#rd-chi-duong')
                .prop('disabled', !hasCoordinates)
                .css({
                    opacity: hasCoordinates ? '1' : '0.55',
                    cursor: hasCoordinates ? 'pointer' : 'not-allowed'
                })
                .attr('title', hasCoordinates ? 'Má»Ÿ báº£n Ä‘á»“ chá»‰ Ä‘Æ°á»ng Ä‘áº¿n vá»‹ trÃ­ bÃ¡o cÃ¡o' : 'BÃ¡o cÃ¡o nÃ y chÆ°a cÃ³ tá»a Ä‘á»™ Ä‘á»ƒ chá»‰ Ä‘Æ°á»ng')
                .off('click')
                .on('click', function() {
                    if (!hasCoordinates) return;

                    const params = new URLSearchParams({
                        lat: String(lat),
                        lng: String(lng),
                        route: '1',
                        reportId: String(id),
                        source: 'admin'
                    });

                    if (info.tieu_de) params.set('title', info.tieu_de);

                    window.location.href = `../user/ban_do2.html?${params.toString()}`;
                });

            const $gridOriginal = $modal.find('#rd-grid-anh-goc').empty();
            const $gridDone = $modal.find('#rd-grid-anh-xuly').empty();
            const images = Array.isArray(payload.hinh_anh) ? payload.hinh_anh : [];

            images.forEach(function(image) {
                const src = image.duong_dan_anh || image.duong_dan;
                if (!src) return;
                if (image.loai_anh === 'bao_cao') $gridOriginal.append(buildThumbHtml(src));
                if (image.loai_anh === 'sau_sua_chua') $gridDone.append(buildThumbHtml(src));
            });

            if ($gridOriginal.children().length === 0) $gridOriginal.append('<small style="color:#999">Không có ảnh</small>');
            if ($gridDone.children().length === 0) $gridDone.append('<small style="color:#999">Chưa có ảnh đối chứng</small>');

            const $timeline = $modal.find('#rd-timeline').empty();
            const timeline = Array.isArray(payload.lich_su) ? payload.lich_su : [];
            timeline.forEach(function(entry) {
                $timeline.append(`
                    <div style="margin-bottom:10px;font-size:13px;padding-left:15px;border-left:2px solid #ddd;position:relative;">
                        <div style="position:absolute;left:-6px;top:4px;width:10px;height:10px;background:#ccc;border-radius:50%;"></div>
                        <strong>${fmtDate(entry.ngay_doi)}</strong>:
                        <span style="color:#888;">${escapeHtml(entry.trang_thai_cu || 'Mới')}</span>
                        &rarr;
                        <span class="text-primary" style="font-weight:600;">${escapeHtml(entry.trang_thai_moi || '')}</span>
                        ${entry.ghi_chu ? `<div style="font-style:italic;color:#666;margin-top:2px;">- Ghi chú: ${escapeHtml(entry.ghi_chu)}</div>` : ''}
                    </div>
                `);
            });

            $modal.fadeIn(150);
        } catch (err) {
            window.showApiError(err);
        }
    };

    $(document).off('click', '.btn-view').on('click', '.btn-view', function() {
        const id = $(this).data('id');
        if (!id) return;
        window.loadReportDetail(id);
    });

    $(document).off('click', '.btn-approve').on('click', '.btn-approve', async function() {
        const id = $(this).data('id');
        const result = await window.openAdminActionModal({
            type: 'success',
            badge: 'Phê duyệt báo cáo',
            title: 'Xác nhận duyệt báo cáo',
            message: 'Báo cáo #' + id + ' sẽ được chuyển sang trạng thái đã duyệt và sẵn sàng để phân công xử lý.',
            confirmText: 'Duyệt báo cáo'
        });
        if (!result.confirmed) return;

        try {
            await window.apiRequest('PUT', `/admin/bao-cao/${id}/duyet`);
            window.showToast({
                type: 'success',
                title: 'Đã duyệt báo cáo',
                message: 'Báo cáo #' + id + ' đã được phê duyệt thành công.'
            });
            await refreshAfterReportAction('cho_duyet', '#table-body-cho-duyet');
        } catch (err) {
            window.showApiError(err);
        }
    });

    $(document).off('click', '.btn-reject').on('click', '.btn-reject', async function() {
        const id = $(this).data('id');
        const result = await window.openAdminActionModal({
            type: 'danger',
            badge: 'Từ chối báo cáo',
            title: 'Xác nhận từ chối báo cáo',
            message: 'Lý do từ chối sẽ được lưu lại để người gửi biết cần điều chỉnh nội dung nào.',
            requireReason: true,
            minLength: 3,
            label: 'Lý do từ chối',
            hint: 'Tối thiểu 3 ký tự. Nên ghi rõ và ngắn gọn để người dùng dễ hiểu.',
            placeholder: 'Ví dụ: Ảnh chưa đủ rõ để xác minh sự cố thực tế.',
            confirmText: 'Xác nhận từ chối'
        });
        if (!result.confirmed) return;

        try {
            await window.apiRequest('PUT', `/admin/bao-cao/${id}/tu-choi`, { ghi_chu: result.value });
            window.showToast({
                type: 'success',
                title: 'Đã từ chối báo cáo',
                message: 'Báo cáo #' + id + ' đã được cập nhật kèm lý do từ chối.'
            });
            await refreshAfterReportAction('cho_duyet', '#table-body-cho-duyet');
        } catch (err) {
            window.showApiError(err);
        }
    });

    $(document).off('click', '.btn-accept').on('click', '.btn-accept', async function() {
        const id = $(this).data('id');
        const result = await window.openAdminActionModal({
            type: 'success',
            badge: 'Nghiệm thu đạt',
            title: 'Xác nhận nghiệm thu hoàn tất',
            message: 'Báo cáo #' + id + ' sẽ được đóng và đánh dấu hoàn thành.',
            confirmText: 'Xác nhận đạt'
        });
        if (!result.confirmed) return;

        try {
            await window.apiRequest('PUT', `/admin/bao-cao/${id}/nghiem-thu`, { ket_qua: 'dat' });
            window.showToast({
                type: 'success',
                title: 'Nghiệm thu thành công',
                message: 'Báo cáo #' + id + ' đã được đóng.'
            });
            await refreshAfterReportAction('cho_nghiem_thu', '#table-body-nghiem-thu');
        } catch (err) {
            window.showApiError(err);
        }
    });

    $(document).off('click', '.btn-reject-nt').on('click', '.btn-reject-nt', async function() {
        const id = $(this).data('id');
        const result = await window.openAdminActionModal({
            type: 'danger',
            badge: 'Nghiệm thu không đạt',
            title: 'Yêu cầu xử lý lại',
            message: 'Báo cáo #' + id + ' sẽ quay lại luồng xử lý để nhân viên tiếp tục khắc phục.',
            requireReason: true,
            minLength: 3,
            label: 'Lý do không đạt',
            hint: 'Tối thiểu 3 ký tự. Nêu rõ phần cần nhân viên xử lý lại.',
            placeholder: 'Ví dụ: Ảnh sau xử lý chưa thể hiện rõ hiện trạng đã khắc phục.',
            confirmText: 'Trả về xử lý'
        });
        if (!result.confirmed) return;

        try {
            await window.apiRequest('PUT', `/admin/bao-cao/${id}/nghiem-thu`, {
                ket_qua: 'khong_dat',
                ghi_chu: result.value
            });
            window.showToast({
                type: 'success',
                title: 'Đã trả về xử lý',
                message: 'Báo cáo #' + id + ' đã được chuyển lại cho nhân viên.'
            });
            await refreshAfterReportAction('cho_nghiem_thu', '#table-body-nghiem-thu');
        } catch (err) {
            window.showApiError(err);
        }
    });

    $(document).off('click', '.report-thumb-img').on('click', '.report-thumb-img', function(e) {
        e.preventDefault();
        const src = $(this).data('src') || $(this).attr('src');
        if (!src) return;

        if ($('#imageViewerModal').length === 0) {
            $(document.body).append(`
                <div id="imageViewerModal" style="display:none;position:fixed;inset:0;z-index:10000;">
                    <div class="iv-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.85);"></div>
                    <div class="iv-content" style="position:relative;max-width:90vw;max-height:90vh;margin:40px auto;display:flex;align-items:center;justify-content:center;">
                        <button class="iv-close" style="position:absolute;right:20px;top:10px;border:none;background:none;color:#fff;font-size:36px;cursor:pointer;">&times;</button>
                        <img id="iv-image" src="${src}" style="max-width:100%;max-height:85vh;border-radius:8px;display:block;margin:0 auto;box-shadow:0 0 20px rgba(0,0,0,0.5);" />
                    </div>
                </div>
            `);
            $('#imageViewerModal .iv-overlay, #imageViewerModal .iv-close').on('click', function() {
                $('#imageViewerModal').fadeOut(150);
            });
        } else {
            $('#iv-image').attr('src', src);
        }

        $('#imageViewerModal').fadeIn(150);
    });
})(window, jQuery);
