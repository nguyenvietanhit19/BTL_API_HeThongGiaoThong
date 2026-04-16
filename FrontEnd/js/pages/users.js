// FILE: js/pages/users.js
(function (window, $) {
    'use strict';

    window.loadUsers = async function (page = 1, limit = 10) {
        try {
            const res = await window.apiRequest('GET', '/admin/nguoi-dung');
            const users = res.danh_sach || res.data || res || [];
            // Apply top filters: search (name/email), role, status
            const q = ($('#search-user').val() || '').toString().trim().toLowerCase();
            const roleFilter = ($('#filter-role').val() || '').toString().trim();
            const statusFilter = ($('#filter-status').val() || '').toString().trim();

            let filteredUsers = users;
            if (q) {
                filteredUsers = filteredUsers.filter(u => ((u.ho_ten || '') + '').toLowerCase().indexOf(q) !== -1 || ((u.email || '') + '').toLowerCase().indexOf(q) !== -1);
            }
            if (roleFilter) {
                filteredUsers = filteredUsers.filter(u => (((u.vai_tro || '') + '').toString().toLowerCase() === roleFilter.toString().toLowerCase()));
            }
            if (statusFilter) {
                if (statusFilter === 'active') {
                    filteredUsers = filteredUsers.filter(u => (u.dang_hoat_dong === 1 || u.dang_hoat_dong === true || String(u.dang_hoat_dong) === '1'));
                } else if (statusFilter === 'locked') {
                    filteredUsers = filteredUsers.filter(u => (u.bi_dinh_chi === 1 || u.bi_dinh_chi === true || String(u.bi_dinh_chi) === '1'));
                }
            }

            const pagination = typeof window.paginateArray === 'function'
                ? window.paginateArray(filteredUsers, page, limit)
                : { data: filteredUsers.slice((page - 1) * limit, page * limit), total: filteredUsers.length, currentPage: page, pageSize: limit };
            const visibleUsers = pagination.data || [];

            const $tb = $('#table-body-users');
            $tb.empty();

            // Cập nhật các chỉ số thống kê ở các card phía trên
            try {
                const total = (users && users.length) ? users.length : 0;
                let adminCount = 0, userCount = 0, activeCount = 0, lockedCount = 0;
                (users || []).forEach(function (u) {
                    const role = (u.vai_tro || '').toString().toLowerCase();
                    if (role === 'admin') adminCount++;
                    if (role === 'user') userCount++;
                    if (u.dang_hoat_dong === 1 || u.dang_hoat_dong === true || String(u.dang_hoat_dong) === '1') activeCount++;
                    if (u.bi_dinh_chi === 1 || u.bi_dinh_chi === true || String(u.bi_dinh_chi) === '1') lockedCount++;
                });
                $('#stat-admin').text(adminCount);
                $('#stat-user').text(userCount);
                $('#stat-active').text(activeCount);
                $('#stat-locked').text(lockedCount);
            } catch (e) { console.warn('Không thể cập nhật thống kê người dùng', e); }

            if (!users.length) {
                $tb.append('<tr><td colspan="5" class="text-center">Không có dữ liệu người dùng</td></tr>');
                if (typeof window.renderPagination === 'function') {
                    window.renderPagination({
                        key: 'users',
                        anchor: '#table-body-users',
                        currentPage: 1,
                        pageSize: pagination.pageSize,
                        totalItems: 0,
                        onPageChange: function (nextPage, nextLimit) {
                            window.loadUsers(nextPage, nextLimit);
                        }
                    });
                }
                return;
            }

            visibleUsers.forEach(function (u) {
                const id = u.nguoi_dung_id || u.id;
                const statusText = u.bi_dinh_chi ? 'Đã khóa' : (u.dang_hoat_dong ? 'Hoạt động' : 'Offline');
                const statusColor = u.bi_dinh_chi ? 'red' : (u.dang_hoat_dong ? 'green' : 'gray');
                const avatarChar = u.ho_ten ? u.ho_ten.charAt(0).toUpperCase() : '?';

                const $tr = $(`<tr class="user-row" data-id="${id}"></tr>`);
                // 1) NGƯỜI DÙNG (tên + email)
                $tr.append(`<td><div class="user-info"><div class="avatar">${avatarChar}</div><div class="name-details"><strong>${u.ho_ten || ''}</strong><span>${u.email || ''}</span></div></div></td>`);
                // 2) VAI TRÒ
                $tr.append(`<td>${u.vai_tro || 'user'}</td>`);
                // 3) TRẠNG THÁI
                $tr.append(`<td><span class="badge ${statusColor}">${statusText}</span></td>`);
                // 4) NGÀY TẠO
                const createdAt = u.ngay_tao ? (window.formatToTZ ? window.formatToTZ(u.ngay_tao, { dateOnly: true }) : (u.ngay_tao.split ? u.ngay_tao.split('T')[0] : u.ngay_tao)) : '';
                $tr.append(`<td>${createdAt}</td>`);
                // 5) HÀNH ĐỘNG
                $tr.append(`<td><button class="btn-action btn-view-user" data-id="${id}">Chi tiết</button></td>`);

                $tb.append($tr);
            });

            if (typeof window.renderPagination === 'function') {
                window.renderPagination({
                    key: 'users',
                    anchor: '#table-body-users',
                    currentPage: pagination.currentPage,
                    pageSize: pagination.pageSize,
                    totalItems: pagination.total,
                    onPageChange: function (nextPage, nextLimit) {
                        window.loadUsers(nextPage, nextLimit);
                    }
                });
            }
        } catch (e) { window.showApiError(e); }
    };

    window.viewUserDetail = async function (id) {
        try {
            const res = await window.apiRequest('GET', `/admin/nguoi-dung/${id}`);
            const u = res.nguoi_dung || res.data || res;

            $('#detailNameHeader').text(u.ho_ten || 'Chi tiết tài khoản');
            $('#valName').text(u.ho_ten || '');
            $('#valEmail').text(u.email || '');
            $('#valRole').text(u.vai_tro || '');
            $('#valStatus').text(u.bi_dinh_chi ? 'Đã khoá' : 'Hoạt động');
            $('#valDate').text(u.ngay_tao ? (window.formatToTZ ? window.formatToTZ(u.ngay_tao, { dateOnly: true }) : (u.ngay_tao.split ? u.ngay_tao.split('T')[0] : u.ngay_tao)) : '');

            $('#valReportCount').text((res.bao_cao && res.bao_cao.length) || 0);

            const $logList = $('#user-log-list');
            $logList.empty();
            if (res.bao_cao && res.bao_cao.length > 0) {
                res.bao_cao.slice(0, 10).forEach(function (bc) {
                    $logList.append(`<div class="log-item"><strong>${bc.tieu_de || 'Báo cáo'}</strong><span>${bc.ngay_tao ? (window.formatToTZ ? window.formatToTZ(bc.ngay_tao, { dateOnly: true }) : (bc.ngay_tao.split ? bc.ngay_tao.split('T')[0] : bc.ngay_tao)) : ''}</span></div>`);
                });
            } else {
                $logList.append('<div class="log-item"><span>Chưa có hoạt động nào</span></div>');
            }

            $('#userDetailPanel').slideDown(200);
        } catch (e) { window.showApiError(e); }
    };

    $(document).on('click', '.btn-view-user', function () {
        const $row = $(this).closest('tr');
        $('.user-row').removeClass('active-row');
        $row.addClass('active-row');
        $('#mainTableContainer').addClass('panel-open');
        window.viewUserDetail($(this).data('id'));
    });

    // Debounced handlers for user filters
    (function () {
        let userTimer;
        $(document).on('input', '#search-user', function () {
            clearTimeout(userTimer);
            userTimer = setTimeout(function () {
                const pageSize = window.getPaginationPageSize ? window.getPaginationPageSize('users', 10) : 10;
                window.loadUsers(1, pageSize);
            }, 300);
        });

        $(document).on('change', '#filter-role, #filter-status', function () {
            const pageSize = window.getPaginationPageSize ? window.getPaginationPageSize('users', 10) : 10;
            window.loadUsers(1, pageSize);
        });
    })();

    $(document).on('click', '#closePanelBtn', function () {
        $('#userDetailPanel').slideUp(200, function () {
            $('#mainTableContainer').removeClass('panel-open');
            $('.user-row').removeClass('active-row');
        });
    });

})(window, jQuery);
