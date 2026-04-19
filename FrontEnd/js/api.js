(function(window, $) {
    'use strict';

    const API_BASE = window.API_BASE || 'http://127.0.0.1:5000';

    window.getToken = function() {
        return localStorage.getItem('token');
    };

    window.setToken = function(t) {
        if (t) localStorage.setItem('token', t);
        else localStorage.removeItem('token');
    };

    window.clearAuthStorage = function() {
        window.setToken(null);
        localStorage.removeItem('vai_tro');
        localStorage.removeItem('ho_ten');
        localStorage.removeItem('user_name');
    };

    window.PREFERRED_TZ_OFFSET = 0;

    window.parseJwt = function(token) {
        if (!token || typeof token !== 'string') return null;

        const parts = token.split('.');
        if (parts.length < 2) return null;

        try {
            const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
            return JSON.parse(window.atob(padded));
        } catch (err) {
            return null;
        }
    };

    window.formatTimestampToTZ = function(s, options) {
        options = options || {};
        var tzOffsetHours = (options.tzOffsetHours !== undefined) ? options.tzOffsetHours : window.PREFERRED_TZ_OFFSET;
        var dateOnly = options.dateOnly;
        if (s === null || s === undefined || s === '') return '';

        var epoch;
        if (s instanceof Date) {
            epoch = s.getTime();
        } else if (typeof s === 'number') {
            epoch = s;
        } else if (typeof s === 'string') {
            if (/[zZ]|[+\-]\d{2}:?\d{2}$/.test(s) || s.indexOf('T') !== -1) {
                var d = new Date(s);
                if (isNaN(d.getTime())) return s;
                epoch = d.getTime();
            } else {
                var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
                if (!m) return s;
                var Y = parseInt(m[1], 10), Mo = parseInt(m[2], 10) - 1, D = parseInt(m[3], 10);
                var h = parseInt(m[4] || '0', 10), mi = parseInt(m[5] || '0', 10), sec = parseInt(m[6] || '0', 10);
                epoch = Date.UTC(Y, Mo, D, h, mi, sec);
            }
        } else {
            return '';
        }

        var tzMs = epoch + tzOffsetHours * 3600000;
        var dt = new Date(tzMs);
        var Y2 = dt.getUTCFullYear(), M2 = dt.getUTCMonth() + 1, D2 = dt.getUTCDate();
        var H2 = dt.getUTCHours(), Min2 = dt.getUTCMinutes();
        var pad = function(n) { return n < 10 ? '0' + n : n; };
        var datePart = Y2 + '-' + pad(M2) + '-' + pad(D2);
        if (dateOnly) return datePart;
        return datePart + ' ' + pad(H2) + ':' + pad(Min2);
    };

    window.formatToTZ = function(s, opts) {
        return window.formatTimestampToTZ(s, opts);
    };

    window.apiRequest = async function(method, path, data, isForm) {
        const headers = {};
        if (!isForm && (method === 'POST' || method === 'PUT')) {
            headers['Content-Type'] = 'application/json';
        }

        const token = window.getToken();
        if (token) headers.Authorization = 'Bearer ' + token;

        const opts = { method: method, headers: headers, mode: 'cors' };
        if (data) opts.body = isForm ? data : JSON.stringify(data);

        const url = path.startsWith('http') ? path : (API_BASE + path);
        const res = await fetch(url, opts);
        const text = await res.text();
        let json = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch (e) {
            json = text;
        }

        if (!res.ok) throw json || { error: 'HTTP ' + res.status };
        return json;
    };

    function ensureAdminUi() {
        if ($('#admin-toast-root').length === 0) {
            $(document.body).append('<div id="admin-toast-root" class="admin-toast-root" aria-live="polite" aria-atomic="true"></div>');
        }

        if ($('#admin-action-modal').length === 0) {
            $(document.body).append(
                '<div id="admin-action-modal" class="admin-modal" style="display:none;" aria-hidden="true">' +
                    '<div class="admin-modal__overlay"></div>' +
                    '<div class="admin-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">' +
                        '<button type="button" class="admin-modal__close" id="admin-modal-close" aria-label="Đóng">&times;</button>' +
                        '<div class="admin-modal__badge" id="admin-modal-badge"></div>' +
                        '<h3 class="admin-modal__title" id="admin-modal-title"></h3>' +
                        '<p class="admin-modal__message" id="admin-modal-message"></p>' +
                        '<div class="admin-modal__field" id="admin-modal-field" style="display:none;">' +
                            '<label class="admin-modal__label" id="admin-modal-label" for="admin-modal-textarea"></label>' +
                            '<textarea id="admin-modal-textarea" class="admin-modal__textarea" rows="5" maxlength="500"></textarea>' +
                            '<div class="admin-modal__hint" id="admin-modal-hint"></div>' +
                        '</div>' +
                        '<div class="admin-modal__actions">' +
                            '<button type="button" class="btn-action btn-secondary" id="admin-modal-cancel">Hủy</button>' +
                            '<button type="button" class="btn-action primary" id="admin-modal-confirm">Xác nhận</button>' +
                        '</div>' +
                    '</div>' +
                '</div>'
            );
        }
    }

    window.showToast = function(options) {
        ensureAdminUi();
        options = options || {};

        const type = options.type || 'info';
        const title = options.title || '';
        const message = options.message || '';
        const duration = typeof options.duration === 'number' ? options.duration : 3200;
        const toastId = 'toast-' + Date.now() + '-' + Math.random().toString(16).slice(2, 8);
        const icon = type === 'success' ? '✓' : type === 'error' ? '!' : 'i';

        const $toast = $(
            '<div class="admin-toast admin-toast--' + type + '" id="' + toastId + '">' +
                '<div class="admin-toast__icon">' + icon + '</div>' +
                '<div class="admin-toast__body">' +
                    '<div class="admin-toast__title"></div>' +
                    '<div class="admin-toast__message"></div>' +
                '</div>' +
                '<button type="button" class="admin-toast__close" aria-label="Đóng">&times;</button>' +
            '</div>'
        );

        $toast.find('.admin-toast__title').text(title);
        $toast.find('.admin-toast__message').text(message);
        $('#admin-toast-root').append($toast);

        requestAnimationFrame(function() {
            $toast.addClass('is-visible');
        });

        const removeToast = function() {
            $toast.removeClass('is-visible');
            setTimeout(function() {
                $toast.remove();
            }, 180);
        };

        $toast.find('.admin-toast__close').on('click', removeToast);
        setTimeout(removeToast, duration);
    };

    window.openAdminActionModal = function(options) {
        ensureAdminUi();
        options = options || {};

        const type = options.type || 'info';
        const requireReason = !!options.requireReason;
        const minLength = options.minLength || 0;
        const confirmText = options.confirmText || 'Xác nhận';
        const cancelText = options.cancelText || 'Hủy';
        const placeholder = options.placeholder || '';
        const label = options.label || '';
        const hint = options.hint || '';
        const value = options.value || '';

        const $modal = $('#admin-action-modal');
        const $confirm = $('#admin-modal-confirm');
        const $textarea = $('#admin-modal-textarea');

        $('#admin-modal-title').text(options.title || '');
        $('#admin-modal-message').text(options.message || '');
        $('#admin-modal-badge')
            .attr('class', 'admin-modal__badge admin-modal__badge--' + type)
            .text(options.badge || '');
        $('#admin-modal-cancel').text(cancelText);
        $confirm.text(confirmText).attr('class', 'btn-action ' + (type === 'danger' ? 'danger' : 'primary'));

        if (requireReason) {
            $('#admin-modal-field').show();
            $('#admin-modal-label').text(label);
            $('#admin-modal-hint').text(hint);
            $textarea.val(value).attr('placeholder', placeholder);
            $confirm.prop('disabled', $textarea.val().trim().length < minLength);
        } else {
            $('#admin-modal-field').hide();
            $('#admin-modal-label').text('');
            $('#admin-modal-hint').text('');
            $textarea.val('').attr('placeholder', '');
            $confirm.prop('disabled', false);
        }

        $modal.stop(true, true).fadeIn(150).attr('aria-hidden', 'false');

        return new Promise(function(resolve) {
            const cleanup = function() {
                $(document).off('keydown.adminActionModal');
                $('#admin-modal-cancel, #admin-modal-close, #admin-action-modal .admin-modal__overlay').off('.adminActionModal');
                $('#admin-modal-confirm').off('.adminActionModal');
                $('#admin-modal-textarea').off('.adminActionModal');
                $modal.stop(true, true).fadeOut(150, function() {
                    $modal.attr('aria-hidden', 'true');
                });
            };

            const closeWith = function(result) {
                cleanup();
                resolve(result);
            };

            $('#admin-modal-cancel, #admin-modal-close, #admin-action-modal .admin-modal__overlay')
                .on('click.adminActionModal', function() {
                    closeWith({ confirmed: false, value: '' });
                });

            $('#admin-modal-confirm').on('click.adminActionModal', function() {
                const currentValue = requireReason ? $textarea.val().trim() : '';
                if (requireReason && currentValue.length < minLength) return;
                closeWith({ confirmed: true, value: currentValue });
            });

            $('#admin-modal-textarea').on('input.adminActionModal', function() {
                if (!requireReason) return;
                $confirm.prop('disabled', $(this).val().trim().length < minLength);
            });

            $(document).on('keydown.adminActionModal', function(e) {
                if (e.key === 'Escape') closeWith({ confirmed: false, value: '' });
            });

            setTimeout(function() {
                if (requireReason) $textarea.trigger('focus');
                else $confirm.trigger('focus');
            }, 30);
        });
    };

    window.confirmLogout = async function(options) {
        options = options || {};
        const result = await window.openAdminActionModal({
            type: 'danger',
            badge: options.badge || 'Đăng xuất',
            title: options.title || 'Xác nhận đăng xuất',
            message: options.message || 'Bạn sẽ cần đăng nhập lại để tiếp tục sử dụng hệ thống. Bạn có chắc chắn muốn đăng xuất không?',
            confirmText: options.confirmText || 'Đăng xuất',
            cancelText: options.cancelText || 'Ở lại'
        });

        if (!result.confirmed) return false;

        window.clearAuthStorage();
        window.location.href = options.redirectUrl || '/FrontEnd/html/dang_nhap/dang_nhap.html';
        return true;
    };

    window.showApiError = function(err) {
        console.error('Chi tiết lỗi API:', err);
        const msg = (err && (err.loi || err.error || err.thong_bao)) || 'Lỗi kết nối máy chủ';
        if (typeof window.showToast === 'function') {
            window.showToast({
                type: 'error',
                title: 'Thao tác không thành công',
                message: msg
            });
            return;
        }
        alert(msg);
    };

    window.renderReportRows = function($tbody, items, actionsHtmlFn) {
        $tbody.empty();
        if (!items || !items.length) {
            $tbody.append('<tr><td colspan="4" class="text-center" style="padding: 20px;">Không có dữ liệu</td></tr>');
            return;
        }

        const statusMap = {
            cho_duyet: { text: 'Chờ duyệt', color: 'orange' },
            da_duyet: { text: 'Đã duyệt', color: 'blue' },
            tu_choi: { text: 'Từ chối', color: 'red' },
            da_phan_cong: { text: 'Đã phân công', color: 'purple' },
            dang_xu_ly: { text: 'Đang xử lý', color: 'orange' },
            cho_nghiem_thu: { text: 'Chờ nghiệm thu', color: 'green' },
            da_xu_ly: { text: 'Đã xử lý', color: 'green' }
        };

        items.forEach(function(item) {
            const title = item.tieu_de || item.ten || 'Không có tiêu đề';
            const loai = item.loai_su_co || item.loai || 'Chưa phân loại';
            const rawStatus = item.trang_thai || item.trang_thai_hien_tai || '';
            const statusObj = statusMap[rawStatus] || { text: rawStatus, color: 'gray' };

            const $tr = $('<tr/>');
            $tr.append($('<td/>').html('<strong>' + $('<div/>').text(title).html() + '</strong>'));
            $tr.append($('<td/>').text(loai));
            if (rawStatus) {
                $tr.append($('<td/>').html('<span class="badge ' + statusObj.color + '">' + statusObj.text + '</span>'));
            } else {
                $tr.append($('<td/>').text('-'));
            }
            const $actionTd = $('<td/>');
            if (typeof actionsHtmlFn === 'function') {
                $actionTd.html(actionsHtmlFn(item));
            }
            $tr.append($actionTd);
            $tbody.append($tr);
        });
    };
})(window, jQuery);
