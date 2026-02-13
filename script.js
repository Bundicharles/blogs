// ============================================
// GLASSBLOG - MAIN SCRIPT (Instagram Edition)
// Public comments, replies, Supabase integration
// With proper post_likes table and fixed Trending
// ============================================

// ---------- Global State ----------
let blogs = [];
let comments = {};          // { blogId: [comment, ...] }
let currentFilter = 'all';
let searchTerm = '';
let currentUser = 'Guest User';
let currentPage = 1;
const POSTS_PER_PAGE = 5;

// ---------- Initialization ----------
document.addEventListener('DOMContentLoaded', async () => {
    // Get or prompt for username
    const stored = localStorage.getItem('glassblog_username');
    if (stored) {
        currentUser = stored;
    } else {
        currentUser = prompt('Enter your name to comment:') || 'Anonymous';
        localStorage.setItem('glassblog_username', currentUser);
    }

    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') lucide.createIcons();

    await initializeApp();
    setupEventListeners();

    // Auto-refresh every 60 seconds
    setInterval(async () => {
        await loadDataFromSupabase();
        renderBlogs();
    }, 60000);
});

async function initializeApp() {
    showLoadingState();
    await loadDataFromSupabase();
    renderBlogs();
    hideLoadingState();
}

function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            searchTerm = e.target.value;
            filterBlogs(currentFilter);
        }, 500));
    }

    // Sort select
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', sortBlogs);
    }

    // Close mobile menu on resize
    window.addEventListener('resize', () => {
        if (window.innerWidth >= 768) {
            document.getElementById('mobileMenu')?.classList.add('hidden');
        }
    });
}

// ---------- Data Loading (Public Read) ----------
async function loadDataFromSupabase() {
    try {
        // Fetch all blogs
        const { data: blogsData, error: blogsError } = await window.supabase
            .from('blogs')
            .select('*')
            .order('created_at', { ascending: false });
        if (blogsError) throw blogsError;

        // Fetch like counts for all blogs
        const { data: likesData, error: likesError } = await window.supabase
            .from('post_likes')
            .select('blog_id');
        if (likesError) throw likesError;

        // Build like count map: { blogId: count }
        const likeCounts = {};
        likesData?.forEach(like => {
            likeCounts[like.blog_id] = (likeCounts[like.blog_id] || 0) + 1;
        });

        blogs = (blogsData || []).map(blog => ({
            id: blog.id,
            title: blog.title || 'Untitled',
            author: blog.author || 'Anonymous',
            type: blog.type || 'article',
            coverImage: blog.cover_image || getDefaultImage(blog.type),
            tags: blog.tags || [],
            content: blog.content || '',
            videoUrl: blog.video_url,
            fileName: blog.file_name,
            fileData: blog.file_data,
            views: blog.views || 0,
            likes: likeCounts[blog.id] || 0,      // real like count from post_likes
            date: blog.created_at
        }));

        // Fetch all comments
        const { data: commentsData, error: commentsError } = await window.supabase
            .from('comments')
            .select('*')
            .order('created_at', { ascending: true });
        if (commentsError) throw commentsError;

        // Organize comments by blog, keep all for nested replies
        comments = {};
        commentsData?.forEach(c => {
            if (!comments[c.blog_id]) comments[c.blog_id] = [];
            comments[c.blog_id].push({
                id: c.id,
                blog_id: c.blog_id,
                parent_id: c.parent_id || null,
                author: c.author || 'Anonymous',
                text: c.text,
                date: c.created_at,
                likes: c.likes || 0
            });
        });

    } catch (error) {
        console.error('Data loading error:', error);
        showToast('Failed to load content. Please refresh.', 'error');
    }
}

function getDefaultImage(type) {
    const images = {
        article: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800',
        vlog: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=800',
        docs: 'https://images.unsplash.com/photo-1569336415962-a4bd9f69cdc5?w=800'
    };
    return images[type] || images.article;
}

// ---------- Rendering (Instagram Feed) ----------
function renderBlogs() {
    const blogGrid = document.getElementById('blogGrid');
    const emptyState = document.getElementById('emptyState');
    if (!blogGrid) return;

    let filtered = filterBlogsArray(blogs);
    if (filtered.length === 0) {
        blogGrid.innerHTML = '';
        emptyState?.classList.remove('hidden');
        return;
    }
    emptyState?.classList.add('hidden');

    const paginated = filtered.slice(0, currentPage * POSTS_PER_PAGE);
    blogGrid.innerHTML = paginated.map(blog => createBlogCard(blog)).join('');

    // Load more button
    let loadMore = document.getElementById('loadMoreContainer');
    if (!loadMore) {
        loadMore = document.createElement('div');
        loadMore.id = 'loadMoreContainer';
        loadMore.className = 'text-center mt-8';
        blogGrid.parentNode.appendChild(loadMore);
    }
    if (filtered.length > currentPage * POSTS_PER_PAGE) {
        loadMore.innerHTML = '<button onclick="loadMoreBlogs()" class="btn-secondary">Load more</button>';
        loadMore.classList.remove('hidden');
    } else {
        loadMore.classList.add('hidden');
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function createBlogCard(blog) {
    const commentCount = comments[blog.id]?.filter(c => !c.parent_id).length || 0;
    const snippet = blog.content
        ? blog.content.substring(0, 120) + '…'
        : (blog.type === 'vlog' ? '▶️ Video content' : '📄 Document');

    return `
        <div onclick="openBlog('${blog.id}')" class="blog-card">
            <div class="blog-card-header">
                <div class="blog-card-avatar">
                    ${blog.author.charAt(0).toUpperCase()}
                </div>
                <span class="blog-card-author">${blog.author}</span>
                <span class="blog-card-date">${formatDate(blog.date)}</span>
            </div>
            <img src="${blog.coverImage}" alt="${blog.title}" class="blog-card-image" loading="lazy"
                 onerror="this.src='${getDefaultImage(blog.type)}'">
            <div class="blog-card-content">
                <h3 class="blog-card-title">${blog.title}</h3>
                <p class="blog-card-snippet">${snippet}</p>
            </div>
            <div class="blog-card-actions">
                <button onclick="event.stopPropagation(); handleLike('${blog.id}')" class="blog-card-action">
                    <i data-lucide="heart" class="icon-small"></i> ${blog.likes || 0}
                </button>
                <button onclick="event.stopPropagation(); openBlog('${blog.id}')" class="blog-card-action">
                    <i data-lucide="message-circle" class="icon-small"></i> ${commentCount}
                </button>
                <button onclick="event.stopPropagation(); shareBlog('${blog.id}')" class="blog-card-action">
                    <i data-lucide="send" class="icon-small"></i> Share
                </button>
            </div>
            <div class="blog-card-stats">
                ${blog.views} views
            </div>
        </div>
    `;
}

// ---------- Filtering & Sorting ----------
function filterBlogsArray(arr) {
    let filtered = [...arr];

    // Apply type filter (skip if filter is 'popular')
    if (currentFilter !== 'all' && currentFilter !== 'popular') {
        filtered = filtered.filter(b => b.type === currentFilter);
    }

    // Apply search filter
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(b =>
            b.title.toLowerCase().includes(term) ||
            b.author.toLowerCase().includes(term) ||
            b.tags.some(tag => tag.toLowerCase().includes(term))
        );
    }

    // If filter is 'popular', sort by likes (highest first) and return immediately
    if (currentFilter === 'popular') {
        return filtered.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    }

    // Otherwise, apply the sort dropdown
    const sortBy = document.getElementById('sortSelect')?.value || 'newest';
    return sortBlogsArray(filtered, sortBy);
}

function sortBlogsArray(arr, sortBy) {
    const sorted = [...arr];
    if (sortBy === 'newest') return sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
    if (sortBy === 'oldest') return sorted.sort((a, b) => new Date(a.date) - new Date(b.date));
    if (sortBy === 'popular') return sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    return sorted;
}

function filterBlogs(filter) {
    currentFilter = filter;
    currentPage = 1;

    // If filter is 'popular', also update the dropdown to show "Popular"
    if (filter === 'popular') {
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) sortSelect.value = 'popular';
    }

    renderBlogs();
}

function sortBlogs() {
    // If current filter is 'popular', do nothing – sorting is fixed
    if (currentFilter === 'popular') return;
    renderBlogs();
}

function loadMoreBlogs() {
    currentPage++;
    renderBlogs();
}

// ---------- Blog Modal (Full page, no cover) ----------
async function openBlog(id) {
    const blog = blogs.find(b => b.id === id);
    if (!blog) return;

    // Increment view count
    try {
        blog.views++;
        await window.supabase
            .from('blogs')
            .update({ views: blog.views })
            .eq('id', id);
    } catch (e) { console.error(e); }

    const modal = document.getElementById('blogModal');
    const modalWrapper = modal.querySelector('.modal-wrapper');
    
    // ----- Build main content area (no cover image!) -----
    let contentHtml = '';
    if (blog.type === 'article') {
        contentHtml = `<div class="article-content">${blog.content.replace(/\n/g, '<br>')}</div>`;
    } else if (blog.type === 'vlog' && blog.videoUrl) {
        let embed = '';
        if (blog.videoUrl.includes('youtu')) {
            const videoId = blog.videoUrl.includes('youtu.be')
                ? blog.videoUrl.split('/').pop().split('?')[0]
                : new URL(blog.videoUrl).searchParams.get('v');
            embed = `<iframe class="video-embed" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>`;
        } else if (blog.videoUrl.includes('vimeo')) {
            const videoId = blog.videoUrl.split('/').pop();
            embed = `<iframe class="video-embed" src="https://player.vimeo.com/video/${videoId}" frameborder="0" allowfullscreen></iframe>`;
        } else {
            embed = `<video src="${blog.videoUrl}" class="video-embed" controls></video>`;
        }
        contentHtml = embed;
    } else if (blog.type === 'docs' && blog.fileName) {
        contentHtml = `
            <div class="document-download">
                <i data-lucide="file-text" style="width: 48px; height: 48px; color: var(--accent-blue);"></i>
                <h3>${blog.fileName}</h3>
                <p>Uploaded ${formatDate(blog.date)}</p>
                <button onclick="downloadFile('${blog.id}')" class="btn-primary">
                    <i data-lucide="download"></i> Download
                </button>
            </div>
        `;
    }

    // ----- Build modal HTML (full page, no image) -----
    modalWrapper.innerHTML = `
        <div class="modal-fullpage">
            <!-- Header with title, author, meta -->
            <div class="modal-header">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <h1 class="modal-title">${blog.title}</h1>
                        <div style="display: flex; align-items: center; gap: 12px; margin: 12px 0;">
                            <span class="blog-card-avatar">${blog.author.charAt(0).toUpperCase()}</span>
                            <span class="modal-author">${blog.author}</span>
                            <span class="modal-date">${formatDate(blog.date, 'full')}</span>
                        </div>
                    </div>
                    <button onclick="closeBlogModal()" class="modal-close-btn">
                        <i data-lucide="x"></i>
                    </button>
                </div>
            </div>

            <!-- Main content (article text / video / download) -->
            <div class="modal-content">
                ${contentHtml}
            </div>

            <!-- Interactions (like & share) -->
            <div class="modal-interactions">
                <button onclick="handleLike('${blog.id}')" class="like-btn">
                    <i data-lucide="heart"></i> <span id="modalLikeCount">${blog.likes || 0}</span>
                </button>
                <button onclick="shareBlog('${blog.id}')" class="share-btn">
                    <i data-lucide="send"></i> Share
                </button>
                <span style="color: var(--text-secondary); margin-left: auto;">
                    <i data-lucide="eye"></i> ${blog.views} views
                </span>
            </div>

            <!-- Comments section -->
            <div class="modal-comments">
                <h3>Comments (${comments[blog.id]?.length || 0})</h3>
                
                <!-- Add comment form -->
                <div class="comment-input-area">
                    <textarea id="newCommentInput" rows="2" placeholder="Add a comment as ${currentUser}..."></textarea>
                    <button onclick="handleAddComment('${blog.id}', null)" class="send-btn">Post</button>
                </div>

                <!-- Comments list -->
                <div id="modalCommentsList" class="comments-list">
                    ${renderCommentsList(blog.id, comments[blog.id]?.filter(c => !c.parent_id) || [])}
                </div>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeBlogModal() {
    document.getElementById('blogModal').classList.add('hidden');
    document.body.style.overflow = 'auto';
}

// Recursive comment tree renderer
function renderCommentsList(blogId, commentList, depth = 0) {
    if (!commentList || commentList.length === 0) {
        return '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No comments yet. Be the first!</p>';
    }

    return commentList.map(comment => {
        const replies = comments[blogId]?.filter(c => c.parent_id === comment.id) || [];
        const replyHtml = replies.length > 0
            ? `<div class="reply">${renderCommentsList(blogId, replies, depth + 1)}</div>`
            : '';

        return `
            <div class="comment" data-comment-id="${comment.id}">
                <div style="display: flex; justify-content: space-between;">
                    <span class="comment-author">${comment.author}</span>
                    <span style="font-size: 11px; color: var(--text-secondary);">${formatDate(comment.date, 'short')}</span>
                </div>
                <p class="comment-text">${comment.text}</p>
                <div class="comment-actions">
                    <button onclick="handleReply('${blogId}', '${comment.id}', '${comment.author}')" class="reply-btn">Reply</button>
                </div>
                ${replyHtml}
                <div id="replyForm-${comment.id}" class="comment-input-area hidden" style="margin-top: 8px; padding-top: 8px;">
                    <textarea id="replyInput-${comment.id}" rows="1" placeholder="Reply to ${comment.author}..."></textarea>
                    <button onclick="handleAddComment('${blogId}', '${comment.id}')" class="send-btn">Post</button>
                </div>
            </div>
        `;
    }).join('');
}

// Toggle reply input visibility
function handleReply(blogId, parentId, author) {
    const form = document.getElementById(`replyForm-${parentId}`);
    if (form) form.classList.toggle('hidden');
}

// ---------- Comments (Public Insert) ----------
async function handleAddComment(blogId, parentId = null) {
    const inputId = parentId ? `replyInput-${parentId}` : 'newCommentInput';
    const input = document.getElementById(inputId);
    const text = input.value.trim();
    if (!text) {
        showToast('Comment cannot be empty', 'warning');
        return;
    }

    try {
        const { error } = await window.supabase
            .from('comments')
            .insert([{
                blog_id: blogId,
                parent_id: parentId,
                author: currentUser,
                text: text,
                created_at: new Date().toISOString(),
                likes: 0
            }]);

        if (error) throw error;

        input.value = '';
        await loadDataFromSupabase();   // Reload comments
        openBlog(blogId);              // Refresh modal
        showToast('Comment added!', 'success');
    } catch (error) {
        console.error('Error adding comment:', error);
        showToast('Failed to add comment. Check RLS policies.', 'error');
    }
}

// ---------- Interactions (Uses post_likes table) ----------
async function handleLike(blogId) {
    const blog = blogs.find(b => b.id === blogId);
    if (!blog) return;

    try {
        // Check if this user already liked this post
        const { data: existing, error: checkError } = await window.supabase
            .from('post_likes')
            .select('id')
            .eq('blog_id', blogId)
            .eq('user_identifier', currentUser)
            .maybeSingle();

        if (checkError) throw checkError;

        if (existing) {
            // Unlike: delete the like record
            const { error: deleteError } = await window.supabase
                .from('post_likes')
                .delete()
                .eq('id', existing.id);

            if (deleteError) throw deleteError;

            blog.likes--;
            showToast('💔 Unliked', 'info');
        } else {
            // Like: insert new record
            const { error: insertError } = await window.supabase
                .from('post_likes')
                .insert([{
                    blog_id: blogId,
                    user_identifier: currentUser
                }]);

            if (insertError) throw insertError;

            blog.likes++;
            showToast('❤️ Liked!', 'success');
        }

        // Update the like count in the modal and feed
        const likeSpan = document.getElementById('modalLikeCount');
        if (likeSpan) likeSpan.textContent = blog.likes;

        // Re-render the card (simple refresh – fine for small sites)
        renderBlogs();

    } catch (error) {
        console.error('Like error:', error);
        showToast('Like failed. Check RLS on post_likes.', 'error');
    }
}

function shareBlog(id) {
    const url = `${window.location.origin}/?post=${id}`;
    navigator.clipboard?.writeText(url).then(() => {
        showToast('Link copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Press Ctrl+C to copy link', 'info');
    });
}

function downloadFile(blogId) {
    const blog = blogs.find(b => b.id === blogId);
    if (blog?.fileData) {
        const link = document.createElement('a');
        link.href = blog.fileData;
        link.download = blog.fileName;
        link.click();
        showToast(`Downloading ${blog.fileName}...`, 'success');
    }
}

// ---------- Utilities ----------
function formatDate(dateString, format = 'short') {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.ceil((now - date) / (1000 * 60 * 60 * 24));
    if (format === 'short') {
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toastMessage');
    if (!toast) return;
    msg.textContent = message;
    toast.className = `admin-toast ${type === 'success' ? 'border-green-500/30' : type === 'error' ? 'border-red-500/30' : 'border-blue-500/30'}`;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ---------- UI Controls ----------
function toggleSearch() {
    const searchBar = document.getElementById('searchBar');
    if (searchBar) searchBar.classList.toggle('hidden');
}

function toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu) mobileMenu.classList.toggle('hidden');
}

function showLoadingState() {
    const grid = document.getElementById('blogGrid');
    if (grid && blogs.length === 0) {
        grid.innerHTML = Array(6).fill(0).map(() => `
            <div class="blog-card skeleton">
                <div class="blog-card-header">...</div>
                <div class="skeleton-image"></div>
                <div class="skeleton-text"></div>
            </div>
        `).join('');
    }
}

function hideLoadingState() {
    // Replaced when renderBlogs runs
}

// ---------- Global Exports ----------
window.filterBlogs = filterBlogs;
window.sortBlogs = sortBlogs;
window.openBlog = openBlog;
window.closeBlogModal = closeBlogModal;
window.handleLike = handleLike;
window.handleAddComment = handleAddComment;
window.handleReply = handleReply;
window.toggleSearch = toggleSearch;
window.toggleMobileMenu = toggleMobileMenu;
window.shareBlog = shareBlog;
window.loadMoreBlogs = loadMoreBlogs;
window.downloadFile = downloadFile;