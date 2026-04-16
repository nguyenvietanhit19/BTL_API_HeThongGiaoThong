// FILE: js/layout.js

$(document).ready(function() {
    // --- 1. LAYOUT (TOPBAR & SIDEBAR) ---
    $('#topbar-container').load('topbar.html', function() {
        let shortTitle = document.title.split(' - ')[0]; 
        $('#topbar-title').text(shortTitle);
    });

    // Global: refresh sidebar counters so other modules can call it after actions
    window.refreshSidebarCounts = async function() {
        try {
            if (typeof window.apiRequest !== 'function') return;
            const res = await window.apiRequest('GET', '/admin_get/dashboard?page=1&limit=1');
            if (res && res.cards) {
                $('#menu-cho-duyet').text(res.cards.cho_duyet || 0);
                $('#menu-da-duyet').text(res.cards.da_duyet || 0);
                $('#menu-tu-choi').text(res.cards.tu_choi || 0);
                $('#menu-cho-phan-cong').text(res.cards.cho_phan_cong || 0);
                $('#menu-da-phan-cong').text(res.cards.da_phan_cong || 0);
                $('#menu-dang-xu-ly').text(res.cards.dang_xu_ly || 0);
                $('#menu-cho-nghiem-thu').text(res.cards.cho_nghiem_thu || 0);
                $('#menu-da-xu-ly').text(res.cards.da_xu_ly || 0);
            }
        } catch (err) {
            console.warn('Không thể tải số liệu sidebar', err);
        }
    };

    $('#sidebar-container').load('sidebar.html', function() {
        function setActiveMenuForPath(pathname) {
            let currentPage = pathname.split("/").pop();
            $('.sidebar .menu-item').removeClass('active');
            $('.sidebar .menu-item').each(function() {
                let menuUrl = $(this).attr('data-url');
                if (menuUrl === currentPage || (currentPage === "" && menuUrl === "tong-quan.html")) {
                    $(this).addClass('active');
                }
            });
        }           
        setActiveMenuForPath(window.location.pathname);

        $('.sidebar .menu-item').on('click', function(e) {
            e.preventDefault();
            const targetUrl = $(this).attr('data-url');
            if (!targetUrl) return;
            const currentPage = window.location.pathname.split('/').pop();
            
            // Tối ưu: Nếu click lại trang đang đứng thì chỉ reload data, không load lại HTML
            if (targetUrl === currentPage || ('/' + targetUrl) === window.location.pathname) {
                window.routeToPage(targetUrl);
            } else {
                window.ajaxNavigate(targetUrl);
            }
        });

        // Khi sidebar đã được nạp, làm mới các con số hiển thị (menu counts)
        if (window.refreshSidebarCounts) window.refreshSidebarCounts();
    });

    // --- 2. UI CHUNG & ĐĂNG XUẤT ---
    $(document).on('click', '#admin-menu-btn', function(e) {
        e.stopPropagation();
        $('#admin-dropdown').toggleClass('show');
    });

    $(document).on('click', function(e) {
        if (!$(e.target).closest('.admin-dropdown-container').length) {
            $('#admin-dropdown').removeClass('show');
        }
    });

    $(document).on('click', '#logout-btn', function(e) {
        e.preventDefault();
        if (confirm("Bạn có chắc chắn muốn đăng xuất không?")) {
            window.setToken(null);
            window.location.href = "/dang_nhap/dang_nhap.html";
        }
    });

    // --- 3. CƠ CHẾ PJAX (SPA ROUTER) ---
    if ($('#pjax-progress').length === 0) {
        $('body').append('<div id="pjax-progress" class="progress-bar" aria-hidden="true"></div>');
    }

    $(document).on('click', 'a', function(e) {
        const href = $(this).attr('href');
        if (!href || $(this).is('[data-no-ajax]') || $(this).attr('target') === '_blank' || $(this).is('#logout-btn')) return;
        if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin || !url.pathname.endsWith('.html')) return;
        e.preventDefault();
        window.ajaxNavigate(url.href);
    });

    window.addEventListener('popstate', function(e) {
        const url = (e.state && e.state.url) ? e.state.url : window.location.href;
        window.ajaxNavigate(url, false);
    });

    history.replaceState({ url: window.location.href }, document.title, window.location.href);

    window.ajaxNavigate = function(href, pushState = true) {
        if (window.__ajaxNavigating) return;
        window.__ajaxNavigating = true;
        const $container = $('.main-content');
        $('#pjax-progress').removeClass('done').css('width', '6%').addClass('active');
        $container.addClass('transitioning');

        setTimeout(function() {
            fetch(href, { credentials: 'same-origin' })
                .then(res => { if (!res.ok) throw new Error('Network error'); return res.text(); })
                .then(html => {
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    const newMain = $(doc).find('.main-content').first();
                    if (newMain.length === 0) { window.location.href = href; return; }

                    $container.stop(true, true).animate({ opacity: 0 }, 160, function() {
                        $container.html(newMain.html());
                        $container.animate({ opacity: 1 }, 240);
                        
                        const newPathname = new URL(href, window.location.href).pathname;
                        if (typeof window.routeToPage === 'function') {
                            window.routeToPage(newPathname);
                        }
                    });

                    const newTitle = doc.querySelector('title') ? doc.querySelector('title').innerText : document.title;
                    document.title = newTitle;
                    $('#topbar-title').text((newTitle.split(' - ')[0]) || newTitle);

                    const newPathname = new URL(href, window.location.href).pathname;
                    $('.sidebar .menu-item').removeClass('active');
                    $('.sidebar .menu-item').each(function() {
                        if ($(this).attr('data-url') === newPathname.split('/').pop()) $(this).addClass('active');
                    });

                    // Nạp Script mới (nếu có)
                    function isScriptAlreadyLoaded(src) {
                        if (!src) return false;
                        try {
                            const name = src.split('/').pop();
                            for (let s of document.scripts) if (s.src && s.src.split('/').pop() === name) return true;
                        } catch (e) { return false; }
                        return false;
                    }

                    $(doc).find('script').each(function() {
                        const src = $(this).attr('src');
                        if (src) {
                            if (/jquery/i.test(src) || /layout\.js$/i.test(src) || /api\.js$/i.test(src) || /kit\.fontawesome/i.test(src)) return;
                            if (!isScriptAlreadyLoaded(src)) {
                                const s = document.createElement('script');
                                s.src = src; s.async = false; document.body.appendChild(s);
                            }
                        } else {
                            if ($(this).closest('.main-content').length > 0 || $(this).is('[data-ajax-exec]')) {
                                const s = document.createElement('script');
                                s.text = $(this).text(); document.body.appendChild(s);
                            }
                        }
                    });

                    if (pushState) history.pushState({ url: href }, newTitle, href);
                })
                .catch(err => { window.location.href = href; }) 
                .finally(() => {
                    $('#pjax-progress').addClass('done');
                    setTimeout(() => { $('#pjax-progress').removeClass('active').css('width', '0'); }, 300);
                    $container.removeClass('transitioning');
                    window.__ajaxNavigating = false;
                });
        }, 40);
    }

    // --- 4. BỘ ĐỊNH TUYẾN CHÍNH (TỔNG ĐÀI) ---
    window.routeToPage = function(pathname) {
        const page = pathname.split('/').pop();
        switch (page) {
            case 'tong-quan.html':
            case '': 
                if (window.loadDashboard) window.loadDashboard(window.getPaginationPage ? window.getPaginationPage('dashboard', 1) : 1, window.getPaginationPageSize ? window.getPaginationPageSize('dashboard', 4) : 4); break;
            case 'cho-duyet.html':
                if (window.loadListByStatus) window.loadListByStatus('cho_duyet', '#table-body-cho-duyet', window.getPaginationPage ? window.getPaginationPage('reports-cho_duyet', 1) : 1, window.getPaginationPageSize ? window.getPaginationPageSize('reports-cho_duyet', 5) : 5); break;
            case 'da-duyet.html':
                if (window.loadListByStatus) window.loadListByStatus('da_duyet', '#table-body-da-duyet', window.getPaginationPage ? window.getPaginationPage('reports-da_duyet', 1) : 1, window.getPaginationPageSize ? window.getPaginationPageSize('reports-da_duyet', 5) : 5); break;
            case 'tu-choi.html':
                if (window.loadListByStatus) window.loadListByStatus('tu_choi', '#table-body-tu-choi', window.getPaginationPage ? window.getPaginationPage('reports-tu_choi', 1) : 1, window.getPaginationPageSize ? window.getPaginationPageSize('reports-tu_choi', 5) : 5); break;
            case 'dang-xu-ly.html':
                if (window.loadListByStatus) window.loadListByStatus('dang_xu_ly', '#table-body-dang-xu-ly', window.getPaginationPage ? window.getPaginationPage('reports-dang_xu_ly', 1) : 1, window.getPaginationPageSize ? window.getPaginationPageSize('reports-dang_xu_ly', 5) : 5); break;
            case 'cho-nghiem-thu.html':
                if (window.loadListByStatus) window.loadListByStatus('cho_nghiem_thu', '#table-body-nghiem-thu', window.getPaginationPage ? window.getPaginationPage('reports-cho_nghiem_thu', 1) : 1, window.getPaginationPageSize ? window.getPaginationPageSize('reports-cho_nghiem_thu', 5) : 5); break;
            case 'da-xu-ly.html':
                if (window.loadListByStatus) window.loadListByStatus('da_xu_ly', '#table-body-da-xu-ly', window.getPaginationPage ? window.getPaginationPage('reports-da_xu_ly', 1) : 1, window.getPaginationPageSize ? window.getPaginationPageSize('reports-da_xu_ly', 5) : 5); break;
            case 'phan-cong.html':
                if (window.loadPhanCong) window.loadPhanCong(window.getPaginationPage ? window.getPaginationPage('assignment', 1) : 1, window.getPaginationPageSize ? window.getPaginationPageSize('assignment', 5) : 5); break;
            case 'da-phan-cong.html':
                if (window.loadListByStatus) window.loadListByStatus('da_phan_cong', '#table-body-da-phan-cong', window.getPaginationPage ? window.getPaginationPage('reports-da_phan_cong', 1) : 1, window.getPaginationPageSize ? window.getPaginationPageSize('reports-da_phan_cong', 5) : 5); break;
            case 'nhan-vien.html':
                if (window.loadNhanVien) window.loadNhanVien(window.getPaginationPage ? window.getPaginationPage('staff', 1) : 1, window.getPaginationPageSize ? window.getPaginationPageSize('staff', 5) : 5); break;
            case 'user.html':
                if (window.loadUsers) window.loadUsers(window.getPaginationPage ? window.getPaginationPage('users', 1) : 1, window.getPaginationPageSize ? window.getPaginationPageSize('users', 5) : 5); break;
            case 'quan-ly-user.html':
                if (window.loadUsers) window.loadUsers(window.getPaginationPage ? window.getPaginationPage('users', 1) : 1, window.getPaginationPageSize ? window.getPaginationPageSize('users', 5) : 5); break;
            case 'thong-tin-tai-khoan.html':
                if (window.loadProfile) window.loadProfile(); break;
            default: break;
        }
    }

    // Chạy khi F5 lần đầu
    try { window.routeToPage(window.location.pathname); } catch(e) { console.error(e); }
});
