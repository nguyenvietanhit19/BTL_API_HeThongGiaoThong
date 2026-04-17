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
        if (role === 'nhan_vien' || role === 'nhân_viên') return { role: 'nhan_vien', label: 'Nhân viên', color: '#198754', isStaff: true };
        return { role: 'user', label: 'User', color: '#0d6efd', isStaff: false };
    }

    function getStatusMeta(user) {
        const isSuspended = normalizeBool(user.bi_dinh_chi);
        const isActive = normalizeBool(user.dang_hoat_dong);

        if (isSuspended) return { text: 'Bị đình chỉ', className: 'red status-suspended', rowClass: 'state-row-suspended', panelClass: 'status-suspended', isSuspended: true, isActive: isActive };
        if (!isActive) return { text: 'Đã khóa', className: 'orange status-locked', rowClass: 'state-row-locked', panelClass: 'status-locked', isSuspended: false, isActive: false };
        return { text: 'Hoạt động', className: 'green', rowClass: '', panelClass: '', isSuspended: false, isActive: true };
    }

    function getUsersPaging() {
        return {
            page: window.getPaginationPage ? window.getPaginationPage('users', 1) : 1,
            limit: window.getPaginationPageSize ? window.getPaginationPageSize('users', 5) : 5
        };
    }

    function getUserFilters() {
        return {
            keyword: ($('#search-user').val() || '').trim().toLowerCase(),
            role: ($('#filter-role').val() || '').trim().toLowerCase(),
            status: ($('#filter-status').val() || '').trim().toLowerCase()
        };
    }

    function filterUsers(users) {
        const filters = getUserFilters();

        return (users || []).filter(function(user) {
            const roleMeta = getRoleMeta(user.vai_tro);
            const statusMeta = getStatusMeta(user);
            const haystack = [
                user.ho_ten || '',
                user.email || '',
                String(user.nguoi_dung_id || user.id || '')
            ].join(' ').toLowerCase();

            const matchesKeyword = !filters.keyword || haystack.includes(filters.keyword);
            const matchesRole = !filters.role || roleMeta.role === filters.role;
            const matchesStatus = !filters.status
                || (filters.status === 'active' && !statusMeta.isSuspended && statusMeta.isActive)
                || (filters.status === 'locked' && (statusMeta.isSuspended || !statusMeta.isActive))
                || (filters.status === 'suspended' && statusMeta.isSuspended);

            return matchesKeyword && matchesRole && matchesStatus;
        });
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

    function formatDisplayDate(value) {
        if (!value) return '';
        if (window.formatToTZ) return window.formatToTZ(value);
        return String(value).split('T')[0] || '';
    }

    function getHistoryActionMeta(action) {
        const map = {
            dinh_chi: { label: 'Đình chỉ tài khoản', color: '#dc2626' },
            go_dinh_chi: { label: 'Gỡ đình chỉ', color: '#15803d' },
            khoa_tk: { label: 'Khóa tài khoản', color: '#d97706' },
            mo_khoa_tk: { label: 'Mở khóa tài khoản', color: '#15803d' },
            cap_quyen: { label: 'Cấp quyền', color: '#2563eb' },
            thu_quyen: { label: 'Thu hồi quyền', color: '#7c3aed' }
        };
        return map[action] || { label: action || 'Cập nhật tài khoản', color: '#4b5563' };
    }

    function formatHistoryValueByAction(action, value) {
        const raw = value === null || value === undefined ? '' : String(value).trim().toLowerCase();

        if (action === 'khoa_tk' || action === 'mo_khoa_tk') {
            if (raw === 'true' || raw === '1') return 'Đang hoạt động';
            if (raw === 'false' || raw === '0') return 'Đã khóa';
        }

        if (action === 'dinh_chi' || action === 'go_dinh_chi') {
            if (raw === 'true' || raw === '1') return 'Bị đình chỉ';
            if (raw === 'false' || raw === '0') return 'Không bị đình chỉ';
        }

        if (action === 'cap_quyen' || action === 'thu_quyen') {
            const roleMap = {
                admin: 'Admin',
                user: 'Người dùng',
                nhan_vien: 'Nhân viên',
                'nhân_viên': 'Nhân viên'
            };
            return roleMap[raw] || (value || '∅');
        }

        return value || '∅';
    }

    function renderUserActivityLogs($logs, userLogs, relatedReports) {
        $logs.empty();

        if (Array.isArray(userLogs) && userLogs.length) {
            userLogs.slice(0, 10).forEach(function(entry) {
                const meta = getHistoryActionMeta(entry.hanh_dong);
                const oldValue = formatHistoryValueByAction(entry.hanh_dong, entry.gia_tri_cu);
                const newValue = formatHistoryValueByAction(entry.hanh_dong, entry.gia_tri_moi);
                const changeLine = oldValue || newValue ? `${oldValue || '∅'} → ${newValue || '∅'}` : '';

                $logs.append(`
                    <div style="padding:10px;border-bottom:1px dashed #ddd;display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
                        <div>
                            <strong style="color:#333;display:block;">${meta.label}</strong>
                            <div style="color:#6b7280;font-size:12px;margin-top:2px;">Thực hiện bởi: ${entry.ten_admin || 'Admin'}</div>
                            ${changeLine ? `<div style="color:${meta.color};font-size:12px;margin-top:4px;font-weight:600;">${changeLine}</div>` : ''}
                        </div>
                        <div style="text-align:right;font-size:11px;white-space:nowrap;">
                            <span style="color:#888;">${formatDisplayDate(entry.thoi_gian)}</span>
                        </div>
                    </div>
                `);
            });
            return;
        }

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
            return;
        }

        $logs.append('<div style="text-align:center;color:#999;padding:15px;">Người dùng này chưa có lịch sử hành động nào.</div>');
    }

    function formatStatusLabel(value) {
        return String(value || '').replace(/_/g, ' ').toUpperCase();
    }

    function getActivityMeta(item) {
        if (item.loai === 'bao_cao_tao') {
            return { label: 'Đăng báo cáo mới', color: '#2563eb' };
        }
        if (item.loai === 'bao_cao_cap_nhat') {
            return { label: 'Cập nhật trạng thái báo cáo', color: '#7c3aed' };
        }
        const accountMeta = getHistoryActionMeta(item.tieu_de);
        return { label: accountMeta.label, color: accountMeta.color };
    }

    function renderUnifiedActivityLogs($logs, activities, relatedReports) {
        $logs.empty();

        if (Array.isArray(activities) && activities.length) {
            activities.slice(0, 12).forEach(function(item) {
                const meta = getActivityMeta(item);
                let detailLine = '';

                if (item.loai === 'bao_cao_tao') {
                    detailLine = `${item.mo_ta || 'Báo cáo sự cố'}${item.tham_chieu ? ' • Mã BC #' + item.tham_chieu : ''}`;
                } else if (item.loai === 'bao_cao_cap_nhat') {
                    detailLine = `${item.mo_ta || 'Báo cáo sự cố'}${item.tham_chieu ? ' • Mã BC #' + item.tham_chieu : ''}`;
                } else {
                    const oldValue = formatHistoryValueByAction(item.tieu_de, item.gia_tri_cu);
                    const newValue = formatHistoryValueByAction(item.tieu_de, item.gia_tri_moi);
                    detailLine = oldValue || newValue ? `${oldValue || '∅'} → ${newValue || '∅'}` : '';
                }

                const extraLine = item.loai === 'bao_cao_cap_nhat'
                    ? `${formatStatusLabel(item.trang_thai_cu || 'mới')} → ${formatStatusLabel(item.trang_thai_moi)}`
                    : '';

                const noteLine = item.ghi_chu ? `Ghi chú: ${item.ghi_chu}` : '';
                const actorLine = item.ten_nguoi_thuc_hien ? `Thực hiện bởi: ${item.ten_nguoi_thuc_hien}` : '';

                $logs.append(`
                    <div style="padding:10px;border-bottom:1px dashed #ddd;display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
                        <div>
                            <strong style="color:#333;display:block;">${meta.label}</strong>
                            ${detailLine ? `<div style="color:#4b5563;font-size:12px;margin-top:3px;">${detailLine}</div>` : ''}
                            ${extraLine ? `<div style="color:${meta.color};font-size:12px;margin-top:4px;font-weight:600;">${extraLine}</div>` : ''}
                            ${noteLine ? `<div style="color:#6b7280;font-size:12px;margin-top:4px;">${noteLine}</div>` : ''}
                            ${actorLine ? `<div style="color:#6b7280;font-size:12px;margin-top:4px;">${actorLine}</div>` : ''}
                        </div>
                        <div style="text-align:right;font-size:11px;white-space:nowrap;">
                            <span style="color:#888;">${formatDisplayDate(item.thoi_gian)}</span>
                        </div>
                    </div>
                `);
            });
            return;
        }

        renderUserActivityLogs($logs, [], relatedReports);
    }

    async function refreshUsersCurrentPage() {
        const paging = getUsersPaging();
        await window.loadUsers(paging.page, paging.limit);
    }

    async function resolveUserActionRequest(action, id) {
        if (action === 'suspend') {
            const modalResult = await window.openAdminActionModal({
                type: 'danger',
                badge: 'Đình chỉ nhân viên',
                title: 'Xác nhận đình chỉ nhân viên',
                message: 'Nhân viên này sẽ không thể tiếp tục nhận hoặc xử lý công việc cho đến khi được gỡ đình chỉ.',
                requireReason: true,
                minLength: 3,
                label: 'Lý do đình chỉ',
                hint: 'Tối thiểu 3 ký tự. Nên ghi rõ nguyên nhân để tiện theo dõi nội bộ.',
                placeholder: 'Ví dụ: Vi phạm quy trình làm việc.',
                confirmText: 'Đình chỉ nhân viên'
            });
            if (!modalResult.confirmed) return null;
            return {
                method: 'PUT',
                path: `/admin/nguoi-dung/${id}/dinh-chi`,
                data: { ly_do: modalResult.value },
                toast: {
                    type: 'success',
                    title: 'Đã đình chỉ nhân viên',
                    message: 'Trạng thái nhân viên đã được cập nhật thành công.'
                }
            };
        }

        if (action === 'unsuspend') {
            const modalResult = await window.openAdminActionModal({
                type: 'success',
                badge: 'Gỡ đình chỉ',
                title: 'Khôi phục trạng thái làm việc',
                message: 'Nhân viên này sẽ được phép quay lại trạng thái sẵn sàng làm việc.',
                confirmText: 'Gỡ đình chỉ'
            });
            if (!modalResult.confirmed) return null;
            return {
                method: 'PUT',
                path: `/admin/nguoi-dung/${id}/dinh-chi`,
                data: null,
                toast: {
                    type: 'success',
                    title: 'Đã gỡ đình chỉ',
                    message: 'Nhân viên đã được khôi phục trạng thái làm việc.'
                }
            };
        }

        if (action === 'deactivate') {
            const modalResult = await window.openAdminActionModal({
                type: 'danger',
                badge: 'Khóa tài khoản',
                title: 'Xác nhận khóa tài khoản',
                message: 'Người dùng này sẽ không thể đăng nhập hoặc tiếp tục sử dụng hệ thống cho đến khi được mở khóa.',
                confirmText: 'Khóa tài khoản'
            });
            if (!modalResult.confirmed) return null;
            return {
                method: 'PUT',
                path: `/admin/nguoi-dung/${id}/trang-thai`,
                data: { dang_hoat_dong: false },
                toast: {
                    type: 'success',
                    title: 'Đã khóa tài khoản',
                    message: 'Tài khoản đã được chuyển sang trạng thái khóa.'
                }
            };
        }

        if (action === 'activate') {
            const modalResult = await window.openAdminActionModal({
                type: 'success',
                badge: 'Mở khóa tài khoản',
                title: 'Khôi phục quyền truy cập',
                message: 'Người dùng này sẽ có thể đăng nhập và sử dụng hệ thống trở lại.',
                confirmText: 'Mở khóa tài khoản'
            });
            if (!modalResult.confirmed) return null;
            return {
                method: 'PUT',
                path: `/admin/nguoi-dung/${id}/trang-thai`,
                data: { dang_hoat_dong: true },
                toast: {
                    type: 'success',
                    title: 'Đã mở khóa tài khoản',
                    message: 'Tài khoản đã được khôi phục quyền truy cập.'
                }
            };
        }

        return null;
    }

    window.loadUsers = async function(page, limit) {
        page = page || 1;
        limit = limit || 5;

        try {
            const res = await window.apiRequest('GET', '/admin/nguoi-dung');
            const users = Array.isArray(res.danh_sach) ? res.danh_sach : [];
            const filteredUsers = filterUsers(users);

            window.currentUsersList = users;

            let adminCount = 0;
            let activeCount = 0;
            let lockedCount = 0;

            filteredUsers.forEach(function(user) {
                const roleMeta = getRoleMeta(user.vai_tro);
                const statusMeta = getStatusMeta(user);

                if (roleMeta.role === 'admin') adminCount += 1;
                if (statusMeta.isSuspended || !statusMeta.isActive) lockedCount += 1;
                else activeCount += 1;
            });

            $('#stat-total').text(filteredUsers.length);
            $('#stat-admin').text(adminCount);
            $('#stat-active').text(activeCount);
            $('#stat-locked').text(lockedCount);
            if ($('#stat-user').length) {
                $('#stat-user').text(filteredUsers.filter(function(user) {
                    return getRoleMeta(user.vai_tro).role === 'user';
                }).length);
            }

            const pagination = typeof window.paginateArray === 'function'
                ? window.paginateArray(filteredUsers, page, limit)
                : {
                    total: filteredUsers.length,
                    currentPage: page,
                    pageSize: limit,
                    data: filteredUsers.slice((page - 1) * limit, page * limit)
                };

            const $tbody = $('#table-body-users');
            $tbody.empty();

            if (!pagination.data.length) {
                $tbody.append('<tr><td colspan="5" class="text-center" style="padding:20px;">Không có dữ liệu người dùng</td></tr>');
                if (typeof window.renderPagination === 'function') {
                    window.renderPagination({
                        key: 'users',
                        anchor: '#table-body-users',
                        currentPage: 1,
                        pageSize: limit,
                        totalItems: 0,
                        onPageChange: function(nextPage, nextLimit) {
                            window.loadUsers(nextPage, nextLimit);
                        }
                    });
                }
                return;
            }

            pagination.data.forEach(function(user) {
                const id = user.nguoi_dung_id || user.id || '';
                const avatarChar = user.ho_ten ? user.ho_ten.charAt(0).toUpperCase() : '?';
                const roleMeta = getRoleMeta(user.vai_tro);
                const statusMeta = getStatusMeta(user);

                $tbody.append(`
                    <tr class="${statusMeta.rowClass || ''}">
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
                    totalItems: filteredUsers.length,
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
                window.showToast({
                    type: 'error',
                    title: 'Không tìm thấy tài khoản',
                    message: 'Không tải được thông tin chi tiết của tài khoản này.'
                });
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
                                <div id="ud-status-card" class="status-card" style="background:#f8f9fa;padding:12px;border-radius:8px;border:1px solid #eee;">
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
            const userLogs = Array.isArray(detailRes.nhat_ky) ? detailRes.nhat_ky : [];
            const activities = Array.isArray(detailRes.hoat_dong) ? detailRes.hoat_dong : [];

            const $modal = $('#userDetailModal');
            const avatarChar = mergedUser.ho_ten ? mergedUser.ho_ten.charAt(0).toUpperCase() : '?';
            const currentUser = window.parseJwt ? window.parseJwt(window.getToken()) : null;
            const actionConfig = buildActionConfig(mergedUser, currentUser && currentUser.nguoi_dung_id);

            $modal.find('#ud-avatar').text(avatarChar).css('background', roleMeta.color);
            $modal.find('#ud-name').text(mergedUser.ho_ten || 'Không có tên');
            $modal.find('#ud-email').text(mergedUser.email || 'N/A');
            $modal.find('#ud-role').html(`<span style="background:${roleMeta.color};color:white;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:bold;">${roleMeta.label.toUpperCase()}</span>`);
            $modal.find('#ud-status').html(`<span class="badge ${statusMeta.className}">${statusMeta.text}</span>`);
            $modal.find('#ud-status-card').attr('class', `status-card ${statusMeta.panelClass || ''}`);
            $modal.find('#ud-date').text(mergedUser.ngay_tao ? String(mergedUser.ngay_tao).split('T')[0] : '...');
            $modal.find('#ud-report-count').text(relatedReports.length + ' báo cáo');

            const $logs = $modal.find('#ud-logs').empty();
            renderUnifiedActivityLogs($logs, activities.length ? activities : userLogs, relatedReports);

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
        const requestConfig = await resolveUserActionRequest(action, id);

        if (!requestConfig) return;

        $button.prop('disabled', true);

        try {
            await window.apiRequest(requestConfig.method, requestConfig.path, requestConfig.data);
            window.showToast(requestConfig.toast);
            $('#userDetailModal').fadeOut(100);
            await refreshUsersCurrentPage();
        } catch (err) {
            $button.prop('disabled', false);
            window.showApiError(err);
        }
    });

    $(document)
        .off('input.userFilter change.userFilter', '#search-user, #filter-role, #filter-status')
        .on('input.userFilter', '#search-user', function() {
            clearTimeout(window.__userFilterTimer);
            window.__userFilterTimer = setTimeout(function() {
                const paging = getUsersPaging();
                window.loadUsers(1, paging.limit);
            }, 300);
        })
        .on('change.userFilter', '#filter-role, #filter-status', function() {
            const paging = getUsersPaging();
            window.loadUsers(1, paging.limit);
        });
})(window, jQuery);
