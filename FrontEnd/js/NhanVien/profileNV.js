let currentProfileData = null;

function initProfilePage() {
    bindProfileEvents();
    loadProfile();
}

function goBackFromEmployeeProfile() {
    if (window.history.length > 1) {
        window.history.back();
        return;
    }

    window.location.href = 'nhanVien.html';
}

function bindProfileEvents() {
    $('#form-update-profile').off('submit').on('submit', function (e) {
        e.preventDefault();

        const fullName = $('#full-name').val().trim();
        if (!fullName) {
            showToast("Họ tên không được để trống", true);
            return;
        }

        const $btn = $(this).find('button[type="submit"]');
        $btn.prop('disabled', true).text('Đang lưu...');

        $.ajax({
            url: `${API_BASE}/auth/toi`,
            method: "PUT",
            headers: authHeader(),
            contentType: "application/json",
            data: JSON.stringify({ ho_ten: fullName }),
            success: function () {
                showToast("Cập nhật thông tin thành công");
                localStorage.setItem("ho_ten", fullName);
                localStorage.setItem("user_name", fullName);
                $('#admin-menu-btn').text(`${fullName} ▾`);
                loadProfile();
            },
            error: function (xhr) {
                showToast(xhr.responseJSON?.loi || "Không thể cập nhật thông tin", true);
            },
            complete: function () {
                $btn.prop('disabled', false).text('Lưu thay đổi');
            }
        });
    });

    $('#form-change-password').off('submit').on('submit', function (e) {
        e.preventDefault();

        const oldPass = $('#old-pass').val();
        const newPass = $('#new-pass').val();
        const confirmPass = $('#confirm-pass').val();

        if (!oldPass || !newPass || !confirmPass) {
            showToast("Vui lòng nhập đầy đủ thông tin mật khẩu", true);
            return;
        }

        if (newPass.length < 6) {
            showToast("Mật khẩu mới phải có ít nhất 6 ký tự", true);
            return;
        }

        if (newPass !== confirmPass) {
            showToast("Xác nhận mật khẩu không khớp", true);
            return;
        }

        const $btn = $(this).find('button[type="submit"]');
        $btn.prop('disabled', true).text('Đang cập nhật...');

        $.ajax({
            url: `${API_BASE}/auth/doi-mat-khau`,
            method: "PUT",
            headers: authHeader(),
            contentType: "application/json",
            data: JSON.stringify({
                mat_khau_cu: oldPass,
                mat_khau_moi: newPass
            }),
            success: function () {
                showToast("Đổi mật khẩu thành công");
                $('#form-change-password')[0].reset();
            },
            error: function (xhr) {
                showToast(xhr.responseJSON?.loi || "Không thể đổi mật khẩu", true);
            },
            complete: function () {
                $btn.prop('disabled', false).text('Cập nhật mật khẩu');
            }
        });
    });

    $('#btn-back').off('click').on('click', function () {
        goBackFromEmployeeProfile();
    });
}

function loadProfile() {
    $.ajax({
        url: `${API_BASE}/auth/toi`,
        method: "GET",
        headers: authHeader(),
        success: function (data) {
            currentProfileData = data || {};
            renderProfile(currentProfileData);
        },
        error: function (xhr) {
            showToast(xhr.responseJSON?.loi || "Không tải được thông tin tài khoản", true);
        }
    });
}

function renderProfile(data) {
    const roleMap = {
        admin: "Quản trị viên",
        nhan_vien: "Nhân viên xử lý",
        user: "Người dùng"
    };

    const roleText = roleMap[data.vai_tro] || (data.vai_tro || 'Chưa xác định');
    const dateText = data.ngay_tao
        ? new Date(data.ngay_tao).toLocaleDateString('vi-VN')
        : '--/--/----';
    const displayName = data.ho_ten || 'Nhân viên';

    $('#display-name').text(displayName);
    $('#profile-name-text').text(displayName);
    $('#profile-email').text(data.email || '--');
    $('#profile-role').text(roleText);
    $('#profile-role-text').text(roleText);
    $('#profile-date').text(`Thành viên từ ${dateText}`);
    $('#profile-user-id').text(data.nguoi_dung_id || '--');
    $('#full-name').val(displayName);
    $('#profile-email-readonly').val(data.email || '');
    $('#profile-avatar').text(displayName.charAt(0).toUpperCase());
}
