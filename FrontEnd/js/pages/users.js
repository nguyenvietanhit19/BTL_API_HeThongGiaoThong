(function(window, $) {
    'use strict';

    function normalizeBool(value) {
        if (value === true || value === 1) return true;
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            return normalized === '1' || normalized === 'true';
        }
        return false;
    }

    function getRoleMeta(value) {
        const role = (value || 'user').toLowerCase();
        if (role === 'admin') return { role: 'admin', label: 'Admin', color: '#dc3545', isStaff: false };
        if (role === 'nhan_vien' || role === 'nhân_vien') return { role: 'nhan_vien', label: 'Nhân viên', color: '#198754', isStaff: true };
        return { role: 'user', label: 'User', color: '#0d6efd', isStaff: false };
    }

    function getStatusMeta(user) {
        const isSuspended = normalizeBool(user.bi_dinh_chi);
        const isActive = normalizeBool(user.dang_hoat_dong);

        if (isSuspended) return { text: 'Bị đình chỉ', className: 'red', isSuspended: true, isActive: isActive };
        if (!isActive) return { text: 'Đã khóa', className: 'orange', isSuspended: false, isActive: false };
        return { text: 'Hoạt động', className: 'green', isSuspended: false, isActive: true };
    }

    function getUsersPaging() {
        return {
            page: window.getPaginationPage ? window.getPaginationPage('users', 1) : 1,
            limit: window.getPaginationPageSize ? window.getPaginationPageSize('users', 5) : 5
        };
    }

    function buildActionConfig(user, currentUserId) {
        const userId = String(user.nguoi_dung_id || user.id || '');
        if (currentUserId && String(currentUserId) === userId) return null;

        const roleMeta = getRoleMeta(user.vai_tro);
        const statusMeta = getStatusMeta(user);

        if (statusMeta.isSuspended) {
            return {
                action: 'unsuspend',
                label: 'Gỡ đình chỉ',
                style: 'background:#28a745;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;'
            };
        }

        if (!statusMeta.isActive) {
            return {
                action: 'activate',
                label: 'Mở khóa tài khoản',
                style: 'background:#28a745;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;'
            };
        }

        if (roleMeta.isStaff) {
            return {
                action: 'suspend',
                label: 'Đình chỉ nhân viên',
                style: 'background:#dc3545;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;'
            };
        }

        return {
            action: 'deactivate',
            label: 'Khóa tài khoản',
            style: 'background:#dc3545;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;'
        };
    }

    function mergeRelatedReports(ownReports, dashboardReports, userId) {
        const merged = new Map();

        (ownReports || []).forEach(function(report) {
            const key = String(report.bao_cao_id || report.id || Math.random());
            merged.set(key, report);
        });

        (dashboardReports || []).forEach(function(report) {
            if (String(report.nhan_vien_id || '') !== String(userId)) return;
            const key = String(report.bao_cao_id || report.id || Math.random());
            if (!merged.has(key)) merged.set(key, report);
        });

        return Array.from(merged.values()).sort(function(a, b) {
            const da = new Date(a.ngay_trang_thai || a.ngay_tao || 0).getTime();
            const db = new Date(b.ngay_trang_thai || b.ngay_tao || 0).getTime();
            return db - da;
        });
    }

    window.loadUsers = async function(page = 1, limit = 10) {
        try {
            const res = await window.apiRequest('GET', '/admin/nguoi-dung');
            const users = Array.isArray(res.danh_sach) ? res.danh_sach : [];
            window.currentUsersList = users;

            let adminCount = 0;
            let activeCount = 0;
            let lockedCount = 0;

            users.forEach(function(user) {
                const roleMeta = getRoleMeta(user.vai_tro);
                const statusMeta = getStatusMeta(user);

                if (roleMeta.role === 'admin') adminCount++;
                if (statusMeta.isSuspended || !statusMeta.isActive) lockedCount++;
                else activeCount++;
            });

            $('#stat-total').text(users.length);
            $('#stat-admin').text(adminCount);
            $('#stat-active').text(activeCount);
            $('#stat-locked').text(lockedCount);

            const pagination = typeof window.paginateArray === 'function'
                ? window.paginateArray(users, page, limit)
                : {
                    total: users.length,
                    currentPage: page,
                    pageSize: limit,
                    data: users.slice((page - 1) * limit, page * limit)
                };

            const $tbody = $('#table-body-users');
            $tbody.empty();

            if (!pagination.data.length) {
                $tbody.append('<tr><td colspan="5" class="text-center" style="padding:20px;">Không có dữ liệu người dùng</td></tr>');
                return;
            }

            pagination.data.forEach(function(user) {
                const id = user.nguoi_dung_id || user.id || '';
                const avatarChar = user.ho_ten ? user.ho_ten.charAt(0).toUpperCase() : '?';
                const roleMeta = getRoleMeta(user.vai_tro);
                const statusMeta = getStatusMeta(user);

                $tbody.append(`
                    <tr>
                        <td>
                            <div class="user-info" style="display:flex;align-items:center;gap:10px;">
                                <div class="avatar" style="width:36px;height:36px;background:${roleMeta.color};color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;">${avatarChar}</div>
                                <div style="display:flex;flex-direction:column;">
                                    <strong>${user.ho_ten || 'Chưa có tên'}</strong>
                                    <small style="color:#888;font-size:12px;">${user.email || ''}</small>
                                </div>
                            </div>
                        </td>
                        <td><span style="background:${roleMeta.color};color:white;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:bold;">${roleMeta.label.toUpperCase()}</span></td>
                        <td><span class="badge ${statusMeta.className}">${statusMeta.text}</span></td>
                        <td>${user.ngay_tao ? String(user.ngay_tao).split('T')[0] : '...'}</td>
                        <td><button class="btn-action btn-view-user" data-id="${id}">Chi tiết</button></td>
                    </tr>
                `);
            });

            if (typeof window.renderPagination === 'function') {
                window.renderPagination({
                    key: 'users',
                    anchor: '#table-body-users',
                    currentPage: page,
                    pageSize: limit,
                    totalItems: users.length,
                    onPageChange: function(nextPage, nextLimit) {
                        window.loadUsers(nextPage, nextLimit);
                    }
                });
            }
        } catch (err) {
            window.showApiError(err);
        }
    };

    window.loadUserDetailModal = async function(id) {
        try {
            const cachedUsers = window.currentUsersList || [];
            const cachedUser = cachedUsers.find(function(user) {
                return String(user.nguoi_dung_id || user.id) === String(id);
            });

            if (!cachedUser) {
                alert('Không tìm thấy thông tin');
                return;
            }

            if ($('#userDetailModal').length === 0) {
                $(document.body).append(`
                    <div id="userDetailModal" style="display:none;position:fixed;inset:0;z-index:9999;">
                        <div class="ud-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);"></div>
                        <div class="ud-content" style="position:relative;max-width:550px;margin:40px auto;background:#fff;border-radius:12px;padding:25px;box-shadow:0 10px 30px rgba(0,0,0,0.2);max-height:85vh;overflow-y:auto;">
                            <button class="ud-close" style="position:absolute;right:15px;top:15px;border:none;background:none;font-size:28px;cursor:pointer;color:#888;">&times;</button>
                            <h3 style="margin-top:0;border-bottom:1px solid #eee;padding-bottom:10px;">Hồ sơ tài khoản</h3>
                            <div id="ud-header" style="display:flex;gap:15px;align-items:center;margin:20px 0;">
                                <div id="ud-avatar" style="width:65px;height:65px;border-radius:50%;color:white;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:bold;box-shadow:0 4px 10px rgba(0,0,0,0.1);"></div>
                                <div>
                                    <h2 id="ud-name" style="margin:0;font-size:20px;color:#333;"></h2>
                                    <p id="ud-email" style="margin:5px 0 0 0;color:#666;font-size:14px;"></p>
                                </div>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:25px;">
                                <div style="background:#f8f9fa;padding:12px;border-radius:8px;border:1px solid #eee;">
                                    <small style="color:#777;display:block;margin-bottom:4px;">Vai trò</small>
                                    <div id="ud-role"></div>
                                </div>
                                <div style="background:#f8f9fa;padding:12px;border-radius:8px;border:1px solid #eee;">
                                    <small style="color:#777;display:block;margin-bottom:4px;">Trạng thái</small>
                                    <div id="ud-status"></div>
                                </div>
                                <div style="background:#f8f9fa;padding:12px;border-radius:8px;border:1px solid #eee;">
                                    <small style="color:#777;display:block;margin-bottom:4px;">Tổng báo cáo liên quan</small>
                                    <div id="ud-report-count" style="font-weight:bold;color:#0d6efd;font-size:16px;">Đang tải...</div>
                                </div>
                                <div style="background:#f8f9fa;padding:12px;border-radius:8px;border:1px solid #eee;">
                                    <small style="color:#777;display:block;margin-bottom:4px;">Ngày tham gia</small>
                                    <div id="ud-date" style="color:#333;font-weight:bold;"></div>
                                </div>
                            </div>
                            <h4 style="margin-bottom:10px;border-left:3px solid #0d6efd;padding-left:8px;">Hoạt động gần đây</h4>
                            <div id="ud-logs" style="border:1px solid #eee;background:#fcfcfc;border-radius:8px;padding:10px;max-height:200px;overflow-y:auto;margin-bottom:20px;font-size:13px;"></div>
                            <div id="ud-actions" style="text-align:right;border-top:1px solid #eee;padding-top:15px;display:flex;justify-content:flex-end;"></div>
                        </div>
                    </div>
                `);

                $('#userDetailModal .ud-close, #userDetailModal .ud-overlay').on('click', function() {
                    $('#userDetailModal').fadeOut(150);
                });
            }

            const detailRes = await window.apiRequest('GET', `/admin/nguoi-dung/${id}`);
            const detailUser = detailRes.nguoi_dung || {};
            const roleMeta = getRoleMeta(detailUser.vai_tro || cachedUser.vai_tro);
            const mergedUser = Object.assign({}, cachedUser, detailUser);
            const statusMeta = getStatusMeta(mergedUser);
            const dashboardRes = await window.apiRequest('GET', '/admin_get/dashboard?page=1&limit=1000');
            const dashboardReports = dashboardRes && dashboardRes.list && Array.isArray(dashboardRes.list.data) ? dashboardRes.list.data : [];
            const relatedReports = mergeRelatedReports(detailRes.bao_cao || [], dashboardReports, id);

            const $modal = $('#userDetailModal');
            const avatarChar = mergedUser.ho_ten ? mergedUser.ho_ten.charAt(0).toUpperCase() : '?';
            const currentUser = window.parseJwt ? window.parseJwt(window.getToken()) : null;
            const actionConfig = buildActionConfig(mergedUser, currentUser && currentUser.nguoi_dung_id);

            $modal.find('#ud-avatar').text(avatarChar).css('background', roleMeta.color);
            $modal.find('#ud-name').text(mergedUser.ho_ten || 'Không có tên');
            $modal.find('#ud-email').text(mergedUser.email || 'N/A');
            $modal.find('#ud-role').html(`<span style="background:${roleMeta.color};color:white;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:bold;">${roleMeta.label.toUpperCase()}</span>`);
            $modal.find('#ud-status').html(`<span class="badge ${statusMeta.className}">${statusMeta.text}</span>`);
            $modal.find('#ud-date').text(mergedUser.ngay_tao ? String(mergedUser.ngay_tao).split('T')[0] : '...');
            $modal.find('#ud-report-count').text(relatedReports.length + ' báo cáo');

            const $logs = $modal.find('#ud-logs').empty();
            if (relatedReports.length) {
                relatedReports.slice(0, 10).forEach(function(report) {
                    const reportId = report.bao_cao_id || report.id || '';
                    const dateText = report.ngay_trang_thai || report.ngay_tao || '';
                    const title = report.tieu_de || 'Báo cáo sự cố';
                    const statusText = (report.trang_thai || '').replace(/_/g, ' ').toUpperCase();
                    $logs.append(`
                        <div style="padding:8px;border-bottom:1px dashed #ddd;display:flex;justify-content:space-between;align-items:center;">
                            <div>
                                <strong style="color:#333;">${title}</strong>
                                <div style="color:#888;font-size:11px;">Mã BC: #${reportId}</div>
                            </div>
                            <div style="text-align:right;font-size:11px;">
                                <span style="color:#888;">${String(dateText).split('T')[0] || ''}</span><br>
                                <strong style="color:#555;">${statusText}</strong>
                            </div>
                        </div>
                    `);
                });
            } else {
                $logs.append('<div style="text-align:center;color:#999;padding:15px;">Người dùng này chưa có báo cáo nào.</div>');
            }

            const $actions = $modal.find('#ud-actions').empty();
            if (currentUser && String(currentUser.nguoi_dung_id) === String(mergedUser.nguoi_dung_id)) {
                $actions.append('<span style="color:#999;font-size:13px;font-style:italic;">(Đây là tài khoản của bạn)</span>');
            } else if (actionConfig) {
                $actions.append(`<button class="btn-action user-action-btn" data-id="${id}" data-action="${actionConfig.action}" style="${actionConfig.style}">${actionConfig.label}</button>`);
            }

            $modal.fadeIn(150);
        } catch (err) {
            window.showApiError(err);
        }
    };

    $(document).off('click', '.btn-view-user').on('click', '.btn-view-user', function() {
        window.loadUserDetailModal($(this).data('id'));
    });

    $(document).off('click', '.user-action-btn').on('click', '.user-action-btn', async function() {
        const id = $(this).data('id');
        const action = $(this).data('action');
        const $button = $(this);
        let requestConfig = null;

        if (action === 'suspend') {
            const reason = prompt('Nhập lý do đình chỉ nhân viên này:');
            if (!reason || !reason.trim()) return;
            requestConfig = {
                method: 'PUT',
                path: `/admin/nguoi-dung/${id}/dinh-chi`,
                data: { ly_do: reason.trim() },
                successMessage: 'Đã đình chỉ nhân viên.'
            };
        } else if (action === 'unsuspend') {
            if (!confirm('Bạn có chắc chắn muốn gỡ đình chỉ cho nhân viên này?')) return;
            requestConfig = {
                method: 'PUT',
                path: `/admin/nguoi-dung/${id}/dinh-chi`,
                data: null,
                successMessage: 'Đã gỡ đình chỉ cho nhân viên.'
            };
        } else if (action === 'deactivate') {
            if (!confirm('Bạn có chắc chắn muốn khóa tài khoản này?')) return;
            requestConfig = {
                method: 'PUT',
                path: `/admin/nguoi-dung/${id}/trang-thai`,
                data: { dang_hoat_dong: false },
                successMessage: 'Đã khóa tài khoản.'
            };
        } else if (action === 'activate') {
            if (!confirm('Bạn có chắc chắn muốn mở khóa tài khoản này?')) return;
            requestConfig = {
                method: 'PUT',
                path: `/admin/nguoi-dung/${id}/trang-thai`,
                data: { dang_hoat_dong: true },
                successMessage: 'Đã mở khóa tài khoản.'
            };
        }

        if (!requestConfig) return;

        $button.prop('disabled', true);

        try {
            await window.apiRequest(requestConfig.method, requestConfig.path, requestConfig.data);
            alert(requestConfig.successMessage);
            $('#userDetailModal').fadeOut(100);
            const paging = getUsersPaging();
            window.loadUsers(paging.page, paging.limit);
        } catch (err) {
            $button.prop('disabled', false);
            window.showApiError(err);
        }
    });
})(window, jQuery);
