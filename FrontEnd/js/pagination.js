(function (window, $) {
    'use strict';

    const states = {};
    const DEFAULT_PAGE_SIZE = 5;

    function ensureStyles() {
        if (document.getElementById('shared-pagination-styles')) return;

        const style = document.createElement('style');
        style.id = 'shared-pagination-styles';
        style.textContent = `
            .shared-pagination {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                flex-wrap: wrap;
                margin-top: 16px;
                padding: 14px 0 4px;
            }
            .shared-pagination-info {
                color: #667085;
                font-size: 14px;
            }
            .shared-pagination-controls {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }
            .shared-pagination-pages {
                display: flex;
                align-items: center;
                gap: 6px;
                flex-wrap: wrap;
            }
            .shared-pagination button,
            .shared-pagination select {
                border: 1px solid #d0d5dd;
                background: #fff;
                color: #344054;
                border-radius: 8px;
                min-width: 38px;
                height: 38px;
                padding: 0 12px;
                cursor: pointer;
            }
            .shared-pagination button.active {
                background: #101828;
                color: #fff;
                border-color: #101828;
            }
            .shared-pagination button:disabled {
                opacity: 0.45;
                cursor: not-allowed;
            }
            .shared-pagination-ellipsis {
                color: #98a2b3;
                min-width: 20px;
                text-align: center;
            }
            .shared-pagination-size {
                display: flex;
                align-items: center;
                gap: 8px;
                color: #667085;
                font-size: 14px;
            }
        `;
        document.head.appendChild(style);
    }

    function getAnchorElement(anchor) {
        if (!anchor) return null;
        if (anchor.jquery) return anchor.first();
        return $(anchor).first();
    }

    function ensureRoot(key, anchor) {
        const $anchor = getAnchorElement(anchor);
        if (!$anchor || !$anchor.length) return $();

        const rootId = 'shared-pagination-' + key;
        let $root = $('#' + rootId);
        if ($root.length) return $root;

        $root = $('<div/>', {
            id: rootId,
            class: 'shared-pagination',
            'data-pagination-key': key
        });

        const $tableContainer = $anchor.closest('.table-container');
        if ($tableContainer.length) {
            $tableContainer.after($root);
        } else {
            $anchor.after($root);
        }

        return $root;
    }

    function buildPageItems(currentPage, totalPages) {
        const items = [];

        function addPage(page) {
            if (!items.includes(page)) items.push(page);
        }

        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i += 1) addPage(i);
            return items;
        }

        addPage(1);
        addPage(totalPages);
        addPage(currentPage);
        addPage(currentPage - 1);
        addPage(currentPage + 1);

        if (currentPage <= 3) {
            addPage(2);
            addPage(3);
            addPage(4);
        }

        if (currentPage >= totalPages - 2) {
            addPage(totalPages - 1);
            addPage(totalPages - 2);
            addPage(totalPages - 3);
        }

        return items
            .filter(function (page) { return page >= 1 && page <= totalPages; })
            .sort(function (a, b) { return a - b; });
    }

    function renderPageButtons($container, currentPage, totalPages) {
        $container.empty();
        const pages = buildPageItems(currentPage, totalPages);
        let lastPage = 0;

        pages.forEach(function (page) {
            if (lastPage && page - lastPage > 1) {
                $container.append('<span class="shared-pagination-ellipsis">...</span>');
            }

            const $btn = $('<button type="button"/>')
                .attr('data-page', page)
                .toggleClass('active', page === currentPage)
                .text(page);
            $container.append($btn);
            lastPage = page;
        });
    }

    window.getPaginationState = function (key) {
        return states[key] || null;
    };

    window.getPaginationPage = function (key, fallback) {
        const state = states[key];
        return state && state.currentPage ? state.currentPage : (fallback || 1);
    };

    window.getPaginationPageSize = function (key, fallback) {
        const state = states[key];
        return state && state.pageSize ? state.pageSize : (fallback || DEFAULT_PAGE_SIZE);
    };

    window.paginateArray = function (items, page, pageSize) {
        const list = Array.isArray(items) ? items : [];
        const safePage = Math.max(1, parseInt(page, 10) || 1);
        const safePageSize = Math.max(1, parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE);
        const start = (safePage - 1) * safePageSize;
        return {
            total: list.length,
            currentPage: safePage,
            pageSize: safePageSize,
            data: list.slice(start, start + safePageSize)
        };
    };

    window.renderPagination = function (options) {
        ensureStyles();

        const key = options.key;
        const totalItems = Math.max(0, parseInt(options.totalItems, 10) || 0);
        const pageSize = Math.max(1, parseInt(options.pageSize, 10) || DEFAULT_PAGE_SIZE);
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        const currentPage = Math.min(Math.max(1, parseInt(options.currentPage, 10) || 1), totalPages);
        const $root = ensureRoot(key, options.anchor);

        states[key] = {
            key: key,
            currentPage: currentPage,
            pageSize: pageSize,
            totalItems: totalItems,
            totalPages: totalPages,
            onPageChange: options.onPageChange
        };

        if (!$root.length) return;

        if (totalItems === 0) {
            $root.empty().hide();
            return;
        }

        const startItem = ((currentPage - 1) * pageSize) + 1;
        const endItem = Math.min(currentPage * pageSize, totalItems);

        $root.show().html(`
            <div class="shared-pagination-info"></div>
            <div class="shared-pagination-controls">
                <div class="shared-pagination-size">
                    <span>So dong</span>
                    <select class="pagination-size">
                        <option value="5">5</option>
                        <option value="6">6</option>
                        <option value="10">10</option>
                        <option value="20">20</option>
                        <option value="50">50</option>
                    </select>
                </div>
                <button type="button" class="pagination-prev">Truoc</button>
                <div class="shared-pagination-pages"></div>
                <button type="button" class="pagination-next">Sau</button>
            </div>
        `);

        $root.find('.shared-pagination-info').text(
            'Hien thi ' + startItem + '-' + endItem + ' / ' + totalItems + ' ban ghi'
        );
        $root.find('.pagination-size').val(String(pageSize));
        $root.find('.pagination-prev').prop('disabled', currentPage <= 1);
        $root.find('.pagination-next').prop('disabled', currentPage >= totalPages);

        renderPageButtons($root.find('.shared-pagination-pages'), currentPage, totalPages);
    };

    $(document).on('click', '.shared-pagination [data-page]', function () {
        const $root = $(this).closest('.shared-pagination');
        const key = $root.data('pagination-key');
        const state = states[key];
        const nextPage = parseInt($(this).attr('data-page'), 10);

        if (!state || !state.onPageChange || nextPage === state.currentPage) return;
        state.onPageChange(nextPage, state.pageSize);
    });

    $(document).on('click', '.shared-pagination .pagination-prev', function () {
        const $root = $(this).closest('.shared-pagination');
        const key = $root.data('pagination-key');
        const state = states[key];

        if (!state || !state.onPageChange || state.currentPage <= 1) return;
        state.onPageChange(state.currentPage - 1, state.pageSize);
    });

    $(document).on('click', '.shared-pagination .pagination-next', function () {
        const $root = $(this).closest('.shared-pagination');
        const key = $root.data('pagination-key');
        const state = states[key];

        if (!state || !state.onPageChange || state.currentPage >= state.totalPages) return;
        state.onPageChange(state.currentPage + 1, state.pageSize);
    });

    $(document).on('change', '.shared-pagination .pagination-size', function () {
        const $root = $(this).closest('.shared-pagination');
        const key = $root.data('pagination-key');
        const state = states[key];
        const nextPageSize = parseInt($(this).val(), 10) || DEFAULT_PAGE_SIZE;

        if (!state || !state.onPageChange) return;
        state.onPageChange(1, nextPageSize);
    });
})(window, jQuery);
