// ============================================
// GLASSBLOG - ADMIN SCRIPT (with file uploads)
// ============================================

// Global State
let blogs = [];
let currentFile = null;        // for documents
let currentCoverFile = null;   // for cover images
let currentVideoFile = null;   // for vlog videos
let deleteId = null;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
    await checkAuth();
    setupEventListeners();
    setupTypeToggle();
    setupFileInputs();
});

async function checkAuth() {
    const { data: { session } } = await window.supabase.auth.getSession();
    if (!session) {
        document.getElementById('loginModal').classList.remove('hidden');
        document.getElementById('dashboard').classList.add('hidden');
        document.querySelector('main')?.classList.add('pointer-events-none', 'blur-md');
    } else {
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        document.querySelector('main')?.classList.remove('pointer-events-none', 'blur-md');
        const adminName = document.getElementById('adminName');
        if (adminName) adminName.textContent = session.user.email?.split('@')[0] || 'Admin';
        await initializeData();
    }
    window.supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') window.location.reload();
    });
}

// ============================================
// AUTHENTICATION
// ============================================
async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    const errorMessage = document.getElementById('loginErrorMessage');
    try {
        const { data, error } = await window.supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showAdminToast('Welcome back, Admin!', 'success');
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        document.querySelector('main')?.classList.remove('pointer-events-none', 'blur-md');
        const adminName = document.getElementById('adminName');
        if (adminName) adminName.textContent = email.split('@')[0];
        await initializeData();
    } catch (error) {
        console.error('Login error:', error);
        if (errorDiv) {
            errorMessage.textContent = error.message || 'Invalid credentials. Please try again.';
            errorDiv.classList.remove('hidden');
        }
        showAdminToast('Login failed: ' + error.message, 'error');
    }
}

async function handleLogout() {
    try {
        const { error } = await window.supabase.auth.signOut();
        if (!error) {
            showAdminToast('Logged out successfully', 'success');
            setTimeout(() => window.location.reload(), 1000);
        }
    } catch (error) {
        console.error('Logout error:', error);
        showAdminToast('Logout failed', 'error');
    }
}

// ============================================
// DATA MANAGEMENT
// ============================================
async function initializeData() {
    try {
        await loadBlogsFromSupabase();
        updateAdminStats();
        renderBlogsTable();
    } catch (error) {
        console.error('Initialization error:', error);
        showAdminToast('Error loading data', 'error');
    }
}

async function loadBlogsFromSupabase() {
    const { data, error } = await window.supabase
        .from('blogs')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) throw error;
    blogs = data || [];
    return blogs;
}

async function refreshData() {
    showAdminToast('Refreshing data...', 'info');
    await initializeData();
    showAdminToast('Data refreshed', 'success');
}

// ============================================
// FILE UPLOAD HELPERS
// ============================================
async function uploadFile(file, bucket) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = fileName;

    const { error } = await window.supabase.storage
        .from(bucket)
        .upload(filePath, file);

    if (error) throw error;

    const { data: publicUrlData } = window.supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
}

// ============================================
// BLOG OPERATIONS
// ============================================
async function createBlog(event) {
    event.preventDefault();
    
    const type = document.querySelector('input[name="blogType"]:checked')?.value;
    const title = document.getElementById('blogTitle').value;
    const author = document.getElementById('blogAuthor').value;
    
    if (!title || !author) {
        showAdminToast('Title and Author are required!', 'error');
        return;
    }

    // Determine cover image: uploaded file takes precedence
    let coverImage = document.getElementById('coverImage').value;
    if (currentCoverFile) {
        try {
            coverImage = await uploadFile(currentCoverFile, 'covers');
        } catch (error) {
            showAdminToast('Cover image upload failed: ' + error.message, 'error');
            return;
        }
    }

    const blogData = {
        title, author, type,
        cover_image: coverImage || getDefaultCover(type),
        tags: document.getElementById('blogTags').value 
            ? document.getElementById('blogTags').value.split(',').map(t => t.trim()).filter(t => t)
            : [],
        content: null,
        video_url: null,
        file_name: null,
        file_data: null,
        views: 0,
        likes: 0,
        created_at: new Date().toISOString()
    };

    // Handle type-specific fields
    if (type === 'article') {
        blogData.content = document.getElementById('blogContent').value;
        if (!blogData.content) {
            showAdminToast('Content is required for articles!', 'error');
            return;
        }
    } else if (type === 'vlog') {
        // Video URL or uploaded file
        let videoUrl = document.getElementById('videoUrl').value;
        
        if (currentVideoFile) {
            try {
                videoUrl = await uploadFile(currentVideoFile, 'videos');
            } catch (error) {
                showAdminToast('Video upload failed: ' + error.message, 'error');
                return;
            }
        }
        
        if (!videoUrl) {
            showAdminToast('Either a video URL or a video file is required for vlogs!', 'error');
            return;
        }
        
        blogData.video_url = videoUrl;
    } else if (type === 'docs') {
        if (!currentFile) {
            showAdminToast('Please select a file to upload!', 'error');
            return;
        }
        blogData.file_name = currentFile.name;
        // Convert file to base64
        const reader = new FileReader();
        reader.onload = async (e) => {
            blogData.file_data = e.target.result;
            await saveBlogToSupabase(blogData);
        };
        reader.onerror = () => showAdminToast('Error reading file', 'error');
        reader.readAsDataURL(currentFile);
        return; // Early return, saveBlogToSupabase will be called inside reader.onload
    }
    
    await saveBlogToSupabase(blogData);
}

async function saveBlogToSupabase(blogData) {
    try {
        const { error } = await window.supabase.from('blogs').insert([blogData]);
        if (error) throw error;
        
        showAdminToast('Post published successfully!', 'success');
        
        // Reset form
        document.getElementById('blogForm').reset();
        removeFile();          // document file
        removeCoverFile();     // cover image file
        removeVideoFile();     // video file
        
        // Hide type-specific fields
        const articleField = document.getElementById('articleContentField');
        const vlogField = document.getElementById('vlogUrlField');
        const docField = document.getElementById('documentUploadField');
        if (articleField) articleField.classList.remove('hidden');
        if (vlogField) vlogField.classList.add('hidden');
        if (docField) docField.classList.add('hidden');
        
        const articleRadio = document.querySelector('input[value="article"]');
        if (articleRadio) articleRadio.checked = true;
        
        await initializeData();
    } catch (error) {
        console.error('Error saving blog:', error);
        showAdminToast('Failed to publish: ' + error.message, 'error');
    }
}

async function deleteBlog(id) {
    deleteId = id;
    document.getElementById('deleteModal')?.classList.remove('hidden');
}

async function confirmDelete() {
    if (!deleteId) return;
    try {
        const { error } = await window.supabase.from('blogs').delete().eq('id', deleteId);
        if (error) throw error;
        showAdminToast('Post deleted successfully', 'success');
        closeDeleteModal();
        await initializeData();
    } catch (error) {
        console.error('Error deleting blog:', error);
        showAdminToast('Failed to delete: ' + error.message, 'error');
    }
}

function closeDeleteModal() {
    document.getElementById('deleteModal')?.classList.add('hidden');
    deleteId = null;
}

async function editBlog(event) {
    event.preventDefault();
    const id = document.getElementById('editId').value;
    const title = document.getElementById('editTitle').value;
    const content = document.getElementById('editContent').value;
    if (!title) {
        showAdminToast('Title is required!', 'error');
        return;
    }
    try {
        const { error } = await window.supabase
            .from('blogs')
            .update({ title, content, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
        showAdminToast('Post updated successfully!', 'success');
        closeEditModal();
        await initializeData();
    } catch (error) {
        console.error('Error updating blog:', error);
        showAdminToast('Failed to update: ' + error.message, 'error');
    }
}

// ============================================
// UI RENDERING – ONLY ARTICLES IN TABLE
// ============================================
function renderBlogsTable() {
    const tbody = document.getElementById('blogsTableBody');
    if (!tbody) return;

    const articles = blogs.filter(blog => blog.type === 'article');

    if (articles.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="py-12 text-center">
                    <div class="flex flex-col items-center">
                        <div class="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-3">
                            <i data-lucide="file-text" class="w-8 h-8 text-gray-500"></i>
                        </div>
                        <p class="text-gray-400 mb-2">No articles yet</p>
                        <p class="text-sm text-gray-500">Create your first article using the form</p>
                    </div>
                </td>
            </tr>
        `;
        const totalPostsCount = document.getElementById('totalPostsCount');
        if (totalPostsCount) totalPostsCount.textContent = '0 articles';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    tbody.innerHTML = articles.map(blog => {
        const typeColors = 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        const typeIcons = 'file-text';
        return `
            <tr class="hover:bg-white/5 transition">
                <td class="py-4 px-6">
                    <div class="flex items-start gap-3">
                        <div class="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                            <img src="${blog.cover_image || getDefaultCover('article')}" 
                                 alt="${blog.title}"
                                 class="w-full h-full object-cover"
                                 onerror="this.src='${getDefaultCover('article')}'">
                        </div>
                        <div>
                            <p class="font-medium text-white mb-1 line-clamp-1">${blog.title || 'Untitled'}</p>
                            <p class="text-xs text-gray-500">${blog.author || 'Unknown'}</p>
                        </div>
                    </div>
                </td>
                <td class="py-4 px-6">
                    <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${typeColors}">
                        <i data-lucide="${typeIcons}" class="w-3 h-3"></i> article
                    </span>
                </td>
                <td class="py-4 px-6">
                    <div class="flex items-center gap-3 text-xs">
                        <span class="flex items-center gap-1 text-gray-400">
                            <i data-lucide="eye" class="w-3 h-3"></i> ${blog.views || 0}
                        </span>
                        <span class="flex items-center gap-1 text-gray-400">
                            <i data-lucide="heart" class="w-3 h-3"></i> ${blog.likes || 0}
                        </span>
                    </div>
                </td>
                <td class="py-4 px-6 text-gray-400 text-sm">${formatDate(blog.created_at)}</td>
                <td class="py-4 px-6">
                    <div class="flex items-center gap-2">
                        <button onclick="openEditModal('${blog.id}')" 
                                class="p-2 hover:bg-cyan-500/20 rounded-lg transition group"
                                title="Edit">
                            <i data-lucide="edit-3" class="w-4 h-4 text-cyan-400 group-hover:scale-110 transition"></i>
                        </button>
                        <button onclick="deleteBlog('${blog.id}')" 
                                class="p-2 hover:bg-red-500/20 rounded-lg transition group"
                                title="Delete">
                            <i data-lucide="trash-2" class="w-4 h-4 text-red-400 group-hover:scale-110 transition"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    const totalPostsCount = document.getElementById('totalPostsCount');
    if (totalPostsCount) {
        totalPostsCount.textContent = `${articles.length} ${articles.length === 1 ? 'article' : 'articles'}`;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function updateAdminStats() {
    try {
        const { count: commentCount } = await window.supabase
            .from('comments')
            .select('*', { count: 'exact', head: true });
        const totalViews = blogs.reduce((sum, blog) => sum + (blog.views || 0), 0);
        
        document.getElementById('adminTotalBlogs').textContent = blogs.length;
        document.getElementById('adminTotalViews').textContent = totalViews.toLocaleString();
        document.getElementById('adminTotalComments').textContent = commentCount || 0;
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// ============================================
// MODAL CONTROLS
// ============================================
function openEditModal(id) {
    const blog = blogs.find(b => b.id === id);
    if (!blog) return;
    document.getElementById('editId').value = blog.id;
    document.getElementById('editTitle').value = blog.title || '';
    document.getElementById('editContent').value = blog.content || '';
    document.getElementById('editModal').classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
}

// ============================================
// FILE HANDLING (Documents)
// ============================================
function handleFile(file) {
    if (file.size > 10 * 1024 * 1024) {
        showAdminToast('File size exceeds 10MB limit', 'error');
        return;
    }
    currentFile = file;
    const fileName = document.getElementById('fileName');
    const filePreview = document.getElementById('filePreview');
    const dropZone = document.getElementById('dropZone');
    if (fileName) fileName.textContent = file.name;
    if (filePreview) filePreview.classList.remove('hidden');
    if (dropZone) dropZone.classList.add('hidden');
}

function removeFile() {
    currentFile = null;
    const filePreview = document.getElementById('filePreview');
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    if (filePreview) filePreview.classList.add('hidden');
    if (dropZone) dropZone.classList.remove('hidden');
    if (fileInput) fileInput.value = '';
}

// ============================================
// COVER IMAGE & VIDEO FILE HANDLING
// ============================================
function setupFileInputs() {
    // Cover image preview
    const coverInput = document.getElementById('coverImageFile');
    if (coverInput) {
        coverInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                currentCoverFile = file;
                const reader = new FileReader();
                reader.onload = (e) => {
                    const preview = document.getElementById('coverPreview');
                    const img = document.getElementById('coverPreviewImg');
                    img.src = e.target.result;
                    preview.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Video file preview
    const videoInput = document.getElementById('videoFile');
    if (videoInput) {
        videoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                currentVideoFile = file;
                const reader = new FileReader();
                reader.onload = (e) => {
                    const preview = document.getElementById('videoPreview');
                    const video = document.getElementById('videoPreviewPlayer');
                    video.src = e.target.result;
                    preview.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        });
    }
}

function removeCoverFile() {
    currentCoverFile = null;
    const input = document.getElementById('coverImageFile');
    const preview = document.getElementById('coverPreview');
    if (input) input.value = '';
    if (preview) preview.classList.add('hidden');
}

function removeVideoFile() {
    currentVideoFile = null;
    const input = document.getElementById('videoFile');
    const preview = document.getElementById('videoPreview');
    if (input) input.value = '';
    if (preview) preview.classList.add('hidden');
}

// ============================================
// UTILITIES
// ============================================
function getDefaultCover(type) {
    const covers = {
        article: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800',
        vlog: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=800',
        docs: 'https://images.unsplash.com/photo-1569336415962-a4bd9f69cdc5?w=800'
    };
    return covers[type] || covers.article;
}

function formatDate(dateString) {
    if (!dateString) return 'No date';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.ceil(Math.abs(now - date) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function showAdminToast(message, type = 'info') {
    const toast = document.getElementById('adminToast');
    const toastMessage = document.getElementById('adminToastMessage');
    if (!toast) return;
    if (toastMessage) toastMessage.textContent = message;
    toast.className = 'admin-toast hidden';
    void toast.offsetWidth;
    toast.classList.remove('hidden');
    if (type === 'success') toast.classList.add('border-green-500/30', 'shadow-green-500/10');
    else if (type === 'error') toast.classList.add('border-red-500/30', 'shadow-red-500/10');
    else toast.classList.add('border-cyan-500/30', 'shadow-cyan-500/10');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ============================================
// EVENT LISTENERS SETUP
// ============================================
function setupEventListeners() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    const blogForm = document.getElementById('blogForm');
    if (blogForm) blogForm.addEventListener('submit', createBlog);
    const editForm = document.getElementById('editForm');
    if (editForm) editForm.addEventListener('submit', editBlog);

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('border-cyan-500', 'bg-cyan-500/5');
        });
        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-cyan-500', 'bg-cyan-500/5');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-cyan-500', 'bg-cyan-500/5');
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) handleFile(e.target.files[0]);
        });
    }
}

function setupTypeToggle() {
    const typeRadios = document.querySelectorAll('input[name="blogType"]');
    const articleField = document.getElementById('articleContentField');
    const vlogField = document.getElementById('vlogUrlField');
    const docField = document.getElementById('documentUploadField');
    typeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const type = e.target.value;
            if (articleField) articleField.classList.add('hidden');
            if (vlogField) vlogField.classList.add('hidden');
            if (docField) docField.classList.add('hidden');
            if (type === 'article' && articleField) articleField.classList.remove('hidden');
            else if (type === 'vlog' && vlogField) vlogField.classList.remove('hidden');
            else if (type === 'docs' && docField) docField.classList.remove('hidden');
        });
    });
}

// ============================================
// EXPOSE GLOBALLY
// ============================================
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.deleteBlog = deleteBlog;
window.confirmDelete = confirmDelete;
window.closeDeleteModal = closeDeleteModal;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.handleFileSelect = (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); };
window.removeFile = removeFile;
window.removeCoverFile = removeCoverFile;
window.removeVideoFile = removeVideoFile;
window.refreshData = refreshData;