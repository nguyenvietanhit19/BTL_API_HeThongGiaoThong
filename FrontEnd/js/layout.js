$(document).ready(function() {
    
    // 1. Tải Topbar và tự động đổi tên theo thẻ <title>
    $('#topbar-container').load('topbar.html', function() {
        let currentPageTitle = document.title; 
        
        // Cắt bớt chữ " - Giao Thông Cộng Đồng" nếu muốn Topbar ngắn gọn
        let shortTitle = currentPageTitle.split(' - ')[0]; 
        $('#topbar-title').text(shortTitle);
    });

    // 2. Tải Sidebar và xử lý logic sáng màu (Active)
    $('#sidebar-container').load('sidebar.html', function() {
        let currentPath = window.location.pathname;
        let currentPage = currentPath.split("/").pop(); // Lấy tên file, vd: "tong-quan.html"

        $('.sidebar .menu-item').each(function() {
            let menuUrl = $(this).attr('data-url');
            
            // So sánh URL để active đúng menu
            if (menuUrl === currentPage || (currentPage === "" && menuUrl === "tong-quan.html")) {
                $(this).addClass('active');
            }
        });

        // Xử lý chuyển trang khi click menu
        $('.sidebar .menu-item').on('click', function() {
            let targetUrl = $(this).attr('data-url');
            if(targetUrl) {
                window.location.href = targetUrl;
            }
        });
    });

    // 3. Logic cho Dropdown Admin trên Topbar
    // Dùng $(document).on để bắt sự kiện vì thẻ này được load bằng AJAX
    $(document).on('click', '#admin-menu-btn', function(e) {
        e.stopPropagation(); 
        $('#admin-dropdown').toggleClass('show');
    });

    // Click ra ngoài thì đóng dropdown
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.admin-dropdown-container').length) {
            $('#admin-dropdown').removeClass('show');
        }
    });

    // Nút Đăng xuất
    $(document).on('click', '#logout-btn', function(e) {
        e.preventDefault();
        if(confirm("Bạn có chắc chắn muốn đăng xuất không?")) {
            // Thay đổi đường dẫn này trỏ về trang login của bạn
            window.location.href = "/login.html"; 
        }
    });
});