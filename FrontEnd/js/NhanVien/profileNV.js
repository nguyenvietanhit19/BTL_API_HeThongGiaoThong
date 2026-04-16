// ============ CONFIG ============
const TOKEN = localStorage.getItem("token");
function initProfilePage() {

    loadProfile();

    // UPDATE PROFILE
    $('#form-update-profile').on('submit', function (e) {
        e.preventDefault();

        const fullName = $('#full-name').val();

        if (!fullName) {
            showToast("Không được để trống", true);
            return;
        }

        $.ajax({
            url: `${API_BASE}/nhan-vien/cap-nhat-thong-tin`,
            method: "PUT",
            headers: {
                Authorization: `Bearer ${localStorage.getItem('token')}`
            },
            contentType: "application/json",
            data: JSON.stringify({ ten: fullName }),
            success: function () {
                showToast("Cập nhật thành công");
                $('#display-name').text(fullName);
                localStorage.setItem("user_name", fullName);
            },
            error: function () {
                showToast("Lỗi server", true);
            }
        });
    });

    // CHANGE PASSWORD
    $('#form-change-password').on('submit', function (e) {
        e.preventDefault();

        const oldPass = $('#old-pass').val();
        const newPass = $('#new-pass').val();
        const confirmPass = $('#confirm-pass').val();

        if (!oldPass || !newPass || !confirmPass) {
            showToast("Nhập đầy đủ mật khẩu", true);
            return;
        }

        if (newPass.length < 8) {
            showToast("Mật khẩu >= 8 ký tự", true);
            return;
        }

        if (newPass !== confirmPass) {
            showToast("Xác nhận mật khẩu sai", true);
            return;
        }

        $.ajax({
            url: `${API_BASE}/nhan-vien/doi-mat-khau`,
            method: "PUT",
            headers: {
                Authorization: `Bearer ${localStorage.getItem('token')}`
            },
            contentType: "application/json",
            data: JSON.stringify({
                mat_khau_cu: oldPass,
                mat_khau_moi: newPass
            }),
            success: function () {
                showToast("Đổi mật khẩu thành công");
                $('#form-change-password')[0].reset();
            },
            error: function () {
                showToast("Lỗi server", true);
            }
        });
    });
}

// ============ LOAD PROFILE ============
function loadProfile() {
    fetch(`${API_BASE}/auth/toi`, {
        headers: {
            "Authorization": `Bearer ${TOKEN}`
        }
    })
    .then(res => {
        if (!res.ok) throw new Error("Token lỗi");
        return res.json();
    })
    .then(data => {
        console.log(data);

        // HIỂN THỊ
        $('#display-name').text(data.ho_ten || '');
        $('#profile-email').text(data.email || '');

        // map role cho đẹp
        const roleMap = {
            admin: "Quản trị viên",
            nhan_vien: "Nhân viên",
            user: "Người dùng"
        };
        $('#profile-role').text(roleMap[data.vai_tro] || data.vai_tro);

        // format ngày
        if (data.ngay_tao) {
            const d = new Date(data.ngay_tao);
            $('#profile-date').text(d.toLocaleString());
        }

        // fill form
        $('#full-name').val(data.ho_ten || '');

        // lưu
        localStorage.setItem("user_name", data.ho_ten || '');
    })
    .catch(err => {
        console.error(err);
        alert("Không tải được thông tin");
    });
}